import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

REPO=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(REPO/'tools'))
import update_core as core

class UpdateWorkflowTests(unittest.TestCase):
    def setUp(self):
        test_root=REPO/'private/test-runs'
        test_root.mkdir(parents=True,exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=test_root)
        self.root=Path(self.temp.name)
        self.site=self.root/'site'
        (self.site/'data').mkdir(parents=True)
        (self.site/'pdf').mkdir()
        manifest=core.read(REPO/'site/data/manifest.json')
        self.doc=next(d for d in manifest['documents'] if d['family']=='income-support-notice').copy()
        for key in ('pdf','data'):shutil.copyfile(REPO/'site'/self.doc[key],self.site/self.doc[key])
        core.write(self.site/'data/manifest.json',{'schema':1,'documents':[self.doc]})
        core.write(self.root/'maintenance/catalog.json',{'schema':1,'documents':[{'family':self.doc['family']}]})
        self.patches=[patch.object(core,'ROOT',self.root),patch.object(core,'PRIVATE',self.root/'private/updates')]
        for p in self.patches:p.start()
        self.source=self.site/self.doc['pdf']
    def tearDown(self):
        for p in reversed(self.patches):p.stop()
        assert self.root.resolve().is_relative_to((REPO/'private/test-runs').resolve())
        self.temp.cleanup()
    def candidate(self):
        return core.prepare(self.source,self.doc['family'],'개정 시험본','2027-01-01',site=self.site)
    def validated(self,plan):
        stage=core.stage_path(plan['id'])
        # Synthetic successful validator result isolates approval/transaction gates.
        report={'plan_sha256':core.digest((stage/'plan.json').read_bytes()),'passed':True,'candidate_snapshot':plan['candidate_snapshot'],
            'engine_sha256':core.engine_hash(),'profile_sha256':plan['profile_sha256'],
            'question_changes':[{'id':'changed-question'}]}
        core.write(stage/'validation.json',report)
        return stage
    def review(self,plan):
        return core.approve(plan['id'],plan['changed_pages'],['changed-question'],'자동 시험',
            {'metadata':True,'boundaries':True,'conditions':True})
    def test_identical_pdf_is_no_change_and_keeps_live_bytes(self):
        before=core.snapshot_hash(self.site)
        plan=core.prepare(self.source,self.doc['family'],self.doc['version'],self.doc['from'],site=self.site)
        self.assertTrue(plan['no_change'])
        self.assertEqual(plan['changed_pages'],[])
        self.assertEqual(core.snapshot_hash(self.site),before)
    def test_revision_preserves_old_version_and_rolls_back_exact_manifest(self):
        before=(self.site/'data/manifest.json').read_bytes()
        plan=self.candidate();profile=core.read(core.stage_path(plan['id'])/'profile.json')
        self.assertEqual([(a['start'],a['end']) for a in profile['annexes']],[(5,9),(10,10),(11,11)])
        self.validated(plan);self.review(plan)
        core.apply(plan['id'])
        docs=core.read(self.site/'data/manifest.json')['documents']
        self.assertEqual(len(docs),2)
        self.assertEqual(docs[0]['to'],'2027-01-01')
        self.assertEqual(docs[1]['from'],'2027-01-01')
        self.assertTrue((self.site/self.doc['pdf']).exists())
        core.rollback(plan['id'])
        self.assertEqual((self.site/'data/manifest.json').read_bytes(),before)
        self.assertTrue((self.site/docs[1]['pdf']).exists())
    def test_changed_questions_and_review_checks_are_required(self):
        plan=self.candidate();self.validated(plan)
        with self.assertRaises(ValueError):core.approve(plan['id'],plan['changed_pages'],[],'',{'metadata':True,'boundaries':True,'conditions':True})
        with self.assertRaises(ValueError):core.approve(plan['id'],plan['changed_pages'],['changed-question'],'',{'metadata':True})
    def test_new_pdf_cannot_reuse_old_profile_or_unapproved_state(self):
        plan=self.candidate();stage=core.stage_path(plan['id'])
        profile=core.read(stage/'profile.json');profile['source_sha256']='0'*64
        with self.assertRaises(ValueError):core.rebuild(plan['id'],profile)
        self.assertFalse((stage/'review.json').exists())
    def test_plan_changes_after_review_are_blocked(self):
        plan=self.candidate();stage=self.validated(plan);self.review(plan)
        plan['new']['data']='data/other.json';core.write(stage/'plan.json',plan)
        with self.assertRaises(ValueError):core.apply(plan['id'])
    def test_post_review_candidate_tampering_is_blocked(self):
        plan=self.candidate();stage=self.validated(plan);self.review(plan)
        (stage/'site'/plan['new']['data']).write_text('{}',encoding='utf-8')
        with self.assertRaises(ValueError):core.apply(plan['id'])
    def test_post_review_engine_or_live_snapshot_changes_are_blocked(self):
        plan=self.candidate();self.validated(plan);self.review(plan)
        core.write(self.root/'maintenance/catalog.json',{'changed':True})
        with self.assertRaises(ValueError):core.apply(plan['id'])
    def test_failed_validation_cannot_be_approved(self):
        plan=self.candidate();stage=self.validated(plan)
        report=core.read(stage/'validation.json');report['passed']=False;core.write(stage/'validation.json',report)
        with self.assertRaises(ValueError):self.review(plan)
    def test_live_change_blocks_rebuild(self):
        plan=self.candidate()
        m=core.read(self.site/'data/manifest.json');m['changed']=True;core.write(self.site/'data/manifest.json',m)
        with self.assertRaises(ValueError):core.rebuild(plan['id'])
    def test_changed_pages_are_aligned_and_required(self):
        changes=core.page_changes([{'text':'A'},{'text':'B'}],[{'text':'X'},{'text':'A'},{'text':'B'}])
        self.assertEqual(changes,[{'kind':'insert','old_pages':[],'new_pages':[1]}])
        plan=self.candidate();plan['changed_pages']=[1];core.write(core.stage_path(plan['id'])/'plan.json',plan);self.validated(plan)
        with self.assertRaises(ValueError):core.approve(plan['id'],[],['changed-question'],'',{'metadata':True,'boundaries':True,'conditions':True})
    def test_blank_pages_and_forms_are_not_treated_as_procedure_body(self):
        pages=[{'page':1,'text':'제1조(목적) 이 고시는 시험을 목적으로 한다.'},{'page':2,'text':'그림'}]
        doc={'type':'고시','title':'시험','sha256':'test'}
        profile={'source_sha256':'test','page_kinds':{'1':'body','2':'figure'},'annexes':[],'procedures':[]}
        index=core.build_index(pages,doc,profile)
        self.assertEqual(index['chunks'][1]['kind'],'figure')
        profile['procedures']=[{'intent':'reporting','start':2,'end':2,'anchor':'그림'}]
        with self.assertRaises(ValueError):core.build_index(pages,doc,profile)
    def test_removed_pages_must_be_reviewed(self):
        plan=self.candidate();plan['removed_pages']=[2];core.write(core.stage_path(plan['id'])/'plan.json',plan);self.validated(plan)
        with self.assertRaises(ValueError):self.review(plan)
        core.approve(plan['id'],plan['changed_pages']+['old:2'],['changed-question'],'',{'metadata':True,'boundaries':True,'conditions':True})
    def test_path_traversal_and_backdated_replacement_are_blocked(self):
        with self.assertRaises(ValueError):core.safe_path(self.site,'../outside')
        with self.assertRaises(ValueError):core.stage_path('../outside')
        with self.assertRaises(ValueError):core.prepare(self.source,self.doc['family'],'다른 버전','2020-01-01',site=self.site)

if __name__=='__main__':unittest.main()
