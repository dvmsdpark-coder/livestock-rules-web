import sys,json,unittest,hashlib,re
from pathlib import Path
import pdfplumber
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from build_reading_pages import normalized,margin_candidates
from build_sop_structure import divider_heading
class ReadingPages(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.data=json.loads((ROOT/'site/data/reading-pages.json').read_text(encoding='utf8'));cls.docs=json.loads((ROOT/'site/data/manifest.json').read_text(encoding='utf8'))['documents']
 def page(self,prefix,n):return next(d for id,d in self.data['documents'].items()if id.startswith(prefix))['pages'][str(n)]
 def test_divider_titles_stop_before_contents_lists_without_collapsing_real_word_spaces(self):
  self.assertEqual(divider_heading('제2장\n조류인플루엔자\n특별방역대책기간\n조치사항\n1. 조치\n2. 예찰'),'제2장 조류인플루엔자 특별방역대책기간 조치사항')
  self.assertEqual(divider_heading('제4장\n고 병 원 성  조 류 인 플 루 엔 자\n발생 시 표준행동요령\n1. 조치'),'제4장 고병원성 조류인플루엔자 발생 시 표준행동요령')
  self.assertIsNone(divider_heading('본문에서 제4장\n12. 조치를 참조한다.'))
 def test_native_margin_candidates_do_not_require_the_number_to_be_last_in_text_order(self):
  from types import SimpleNamespace
  page=SimpleNamespace(height=842,extract_words=lambda:[])
  values=margin_candidates(page,[{'text':'3','box':[480,730,496,744]},{'text':'⚫','box':[500,740,505,745]}],9)
  self.assertEqual(values[0]['number'],3)
 def test_odd_fmd_printed_page_numbers_are_removed_throughout_the_body(self):
  for n in range(9,286,2):
   p=self.page('de2',n)
   if p.get('divider'):continue
   self.assertFalse(any(l['text'].strip()==str(n-6)and l['box'][1]>p['height']*.86 for l in p['lines']),n)
 def test_every_document_revision_and_physical_page_is_present(self):
  for d in self.docs:
   item=self.data['documents'][d['id']];self.assertEqual(item['source_sha256'],hashlib.sha256((ROOT/'site'/d['pdf']).read_bytes()).hexdigest());self.assertEqual(len(item['pages']),d['pages']);self.assertEqual(json.loads((ROOT/'site/data/reading'/(d['sha256']+'.json')).read_text(encoding='utf8')),item)
 def test_asf_source_spaces_and_separate_subtitles(self):
  text='\n'.join(l['text']for l in self.page('7b7',179)['lines']);self.assertIn('1. 목적',text);self.assertIn('살처분 및 사체처리 현장에 동원된 자에 대한',text);self.assertIn('2. 살처분 및 사체처리 참여자의 트라우마 예방 및 안전 교육',text)
 def test_fmd_native_table_and_surveillance_grids_are_selectable(self):
  for n,minimum in [(10,1),(167,1),(168,2)]:
   blocks=self.page('de2',n)['blocks'];self.assertGreaterEqual(sum(b['kind']=='table'for b in blocks),minimum,n);self.assertFalse(any(b.get('fullPage')for b in blocks),n)
 def test_furniture_removed_without_removing_body_numbers(self):
  p=self.page('3d9',42);self.assertNotIn('35',[l['text'].strip()for l in p['lines']]);self.assertIn('35',p['excluded'])
 def test_glossary_banner_is_not_an_illustration(self):self.assertFalse(any(b['kind']=='image'for b in self.page('de2',16)['blocks']))
 def test_all_sop_text_and_table_cells_have_lossless_native_glyph_coverage(self):
  for doc in self.docs:
   if doc['type']!='SOP':continue
   with pdfplumber.open(ROOT/'site'/doc['pdf'])as pdf:
    for n,page in self.data['documents'][doc['id']]['pages'].items():
     native=''.join(l['text']for l in page['lines']);self.assertEqual(sum(normalized(native).values()),page['retained_chars'],(doc['id'],n))
     blocks=page['blocks'];shown=''
     for b in blocks:
      if b['kind']=='text':shown+=''.join(l['text']for l in b['lines'])
      elif b['kind']=='table':
       slots=set()
       for r,row in enumerate(b['rows']):
        for c in row:
         shown+=c['text']
         for y in range(r,r+c['rowspan']):
          for x in range(c['col'],c['col']+c['colspan']):self.assertNotIn((y,x),slots);slots.add((y,x))
       self.assertEqual(len(slots),len(b['rows'])*b['columns'])
      else:
       self.assertTrue((ROOT/'site'/b['crop']['path']).exists());box=b['sourceBox'];shown+=''.join(c['text']for c in pdf.pages[int(n)-1].chars if box[0]-.2<=(c['x0']+c['x1'])/2<=box[2]+.2 and box[1]-.2<=(c['top']+c['bottom'])/2<=box[3]+.2)
     # A retained source image can include verified margin furniture. Every
     # body glyph must survive; only those excluded furniture glyphs may recur.
     extra=normalized(shown)-normalized(native);missing=normalized(native)-normalized(shown)
     self.assertFalse(missing,(doc['id'],n,missing));self.assertFalse(extra-normalized(page['excluded']),(doc['id'],n,extra))
     pdf.pages[int(n)-1].close()
if __name__=='__main__':unittest.main()
