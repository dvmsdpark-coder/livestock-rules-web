import sys,unittest,json
from pathlib import Path
from types import SimpleNamespace
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from page_furniture import page_candidates,confirmed_furniture

class PageFurniture(unittest.TestCase):
    def test_numeric_content_outside_margin_or_without_a_sequence_is_preserved(self):
        page=SimpleNamespace(height=800)
        self.assertEqual(page_candidates(page,[((70,300,90,315),'210')],'210\n본문',217),[])
        items=page_candidates(page,[((70,740,90,755),'210')],'210\n본문',217)
        self.assertEqual(confirmed_furniture(items),{})
    def test_margin_candidates_also_require_source_edge_and_repeated_position(self):
        page=SimpleNamespace(height=800)
        self.assertEqual(page_candidates(page,[((70,740,90,755),'210')],'본문\n210\n다음 본문',217),[])
        items=[]
        for n in [216,217,218]:items+=page_candidates(page,[((70,740,90,755),str(n-7))],str(n-7)+'\n3) 조치를 실시한다.',n)
        result=confirmed_furniture(items);self.assertEqual(result['217'][0]['text'],'210');self.assertEqual(result['217'][0]['source_edge'],'start');self.assertEqual(result['217'][0]['edge'],'bottom')
    def test_hyphenated_footers_and_numbers_at_the_end_of_source_text(self):
        page=SimpleNamespace(height=800);items=[]
        for n in [10,11,12]:items+=page_candidates(page,[((250,760,290,773),f'- {n-2} -')],f'본문 조치\n- {n-2} -',n)
        result=confirmed_furniture(items);self.assertEqual(result['10'][0]['source_edge'],'end');self.assertEqual(result['10'][0]['context'],'본문조치')
    def test_page_number_sharing_a_footer_line_with_running_title_is_still_detected(self):
        page=SimpleNamespace(height=800,extract_words=lambda:[dict(text='94',x0=90,top=700,x1=102,bottom=714)])
        items=[]
        for n in [100,101,102]:
            page.extract_words=lambda n=n:[dict(text=str(n-6),x0=90,top=700,x1=102,bottom=714)]
            items+=page_candidates(page,[((90,700,250,714),f'{n-6} ⚫ 긴급행동지침')],f'{n-6}\n⚫ 긴급행동지침\n본문',n)
        self.assertEqual(confirmed_furniture(items)['100'][0]['text'],'94')
    def test_rotated_page_numbers_are_verified_at_side_margin_without_treating_normal_table_values_as_furniture(self):
        page=SimpleNamespace(width=750,height=550,extract_words=lambda:[]);items=[]
        for n in [327,328,329]:
            page.extract_words=lambda n=n:[dict(text=str(n-7),x0=48,top=200,x1=58,bottom=217,upright=False)]
            items+=page_candidates(page,[],str(n-7)+'\n서식 본문',n)
        self.assertEqual(confirmed_furniture(items)['327'][0]['edge'],'left')
        page.extract_words=lambda:[dict(text='320',x0=48,top=200,x1=58,bottom=217,upright=True)]
        self.assertEqual(page_candidates(page,[],'320\n표 본문',327),[])
    def test_real_hpai_printed_210_is_bottom_furniture_not_the_pdf_page_number(self):
        import pdfplumber
        from sop_visuals import lines
        manifest=json.loads((ROOT/'site/data/manifest.json').read_text(encoding='utf-8'));doc=next(d for d in manifest['documents'] if d['id']=='3d9ae693-1bb3-5f8c-af9e-0e3512252566');index=json.loads((ROOT/'site'/doc['data']).read_text(encoding='utf-8'));items=[]
        with pdfplumber.open(ROOT/'site'/doc['pdf']) as pdf:
            for n in [216,217,218]:items+=page_candidates(pdf.pages[n-1],lines(pdf.pages[n-1]),index['pages'][n-1]['text'],n)
        item=confirmed_furniture(items)['217'][0];self.assertEqual(item['text'],'210');self.assertEqual(item['edge'],'bottom');self.assertEqual(item['source_edge'],'start');self.assertTrue(item['context'].startswith('3)발생일'))
if __name__=='__main__':unittest.main()
