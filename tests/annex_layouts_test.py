import sys,json,unittest,hashlib
from pathlib import Path
import pdfplumber
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from build_annex_layouts import count,detail_cells,aligned_amount_cells,aligned_fee_cells
from types import SimpleNamespace
from unittest.mock import patch
class AnnexLayouts(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.data=json.loads((ROOT/'site/data/annex-layouts.json').read_text(encoding='utf-8'));cls.manifest=json.loads((ROOT/'site/data/manifest.json').read_text(encoding='utf-8'))
 def document(self,typ):
  doc=next(d for d in self.manifest['documents'] if d['type']==typ);return doc,self.data['documents'][doc['id']]['pages']
 def fake_grid(self,descriptions,values):
  cells=[(0,0,10,100),(10,0,20,100),(20,0,30,100),(30,0,40,100)]
  chars=[{'x0':col*10+1,'x1':col*10+2,'top':y,'bottom':y+1,'text':s} for col,lines in enumerate([descriptions,[(5,'법적 근거')],*values]) for y,s in lines]
  return SimpleNamespace(chars=chars),cells
 def test_income_support_annex_uses_pdf_native_lines_and_preserves_every_formula_character(self):
  doc=next(d for d in self.manifest['documents'] if d['id']=='1dce0635-63a4-5b58-b3a0-63cd313ed189');layouts=self.data['documents'][doc['id']]['pages']
  with pdfplumber.open(ROOT/'site'/doc['pdf']) as pdf:
   for n in range(5,10):
    layout=layouts[str(n)];self.assertEqual(layout['mode'],'text');self.assertGreater(layout['text'].count('\n'),10);self.assertEqual(count(layout['text']),count(''.join(c['text'] for c in pdf.pages[n-1].chars)));self.assertEqual(''.join(layout['text'].split()),''.join(c['text'] for c in pdf.pages[n-1].chars if not c['text'].isspace()))
  self.assertIn('\n가. 지원 대상:',layouts['5']['text']);self.assertIn('\n나. 지원 범위',layouts['5']['text']);self.assertIn('\n(1) 산출식:',layouts['5']['text']);self.assertIn('×',layouts['5']['text']);self.assertIn('3%',layouts['6']['text']);self.assertIn('10일 미만',layouts['6']['text']);self.assertIn('10일 이상',layouts['6']['text'])
 def test_unnumbered_payment_labels_require_matching_amount_positions(self):
  cells=[(0,0,10,100),(10,0,20,100),(20,0,30,100),(30,0,40,100)]
  chars=[{'x0':col*10+1,'x1':col*10+2,'top':y,'bottom':y+1,'text':s} for col,lines in enumerate([[(5,'젖소')],[(10,'송아지'),(40,'초임만삭'),(70,'초산우')],[(10,'200,000'),(40,'500,000'),(70,'400,000')],[(10,'공통 비고')]]) for y,s in lines];page=SimpleNamespace(chars=chars)
  with patch('build_annex_layouts.source_lines',side_effect=lambda cs:[(c['top'],c['text']) for c in cs]):
   result=aligned_amount_cells(page,cells);self.assertEqual(len(result),8);self.assertIn(cells[0],result);self.assertIn(cells[3],result)
   for c in chars:
    if c['x0']>20 and c['x0']<30:c['top']+=8;c['bottom']+=8
   self.assertEqual(aligned_amount_cells(page,cells),cells)
 def test_compensation_notice_payment_rows_keep_labels_and_amounts_paired(self):
  doc=next(d for d in self.manifest['documents'] if d['id']=='73aa19cc-15fb-5758-8a8c-10cc64ab8085');table=next(b for b in self.data['documents'][doc['id']]['pages']['26']['blocks'] if b['kind']=='table')
  expected=[('송아지','200,000'),('초임만삭','500,000'),('초산우','400,000'),('다산우(2-5산)','300,000'),('노산우ㆍ기타','200,000'),('임신우(초임단계이후)','400,000'),('300～499kg 이하(암ㆍ수)','200,000'),('299kg 이하(암ㆍ수)','300,000'),('모돈','150,000'),('웅돈','150,000')]
  actual=[(next(c['text'] for c in row if c['col']==1),next(c['text'] for c in row if c['col']==2)) for row in table['rows'][1:11]];self.assertEqual(actual,expected)
  self.assertEqual(table['rows'][1][0]['rowspan'],5);self.assertEqual(next(c for c in table['rows'][1] if c['col']==3)['rowspan'],5)
 def test_native_rule_sentence_ending_does_not_become_an_extra_da_item(self):
  doc=next((d for d in self.manifest['documents'] if d['sha256']=='25ef0494687bf942ebabde909478e218baf7a4d2ec2efe269198d478cd0a6d11'),None)
  if not doc:self.skipTest('Original rule revision not included in this release')
  page=self.data['documents'][doc['id']]['pages']['95'];self.assertEqual(page['mode'],'text');self.assertIn('실시하여야 한다. 방문자는',page['text']);self.assertNotIn('한\n다. 방문자는',page['text']);self.assertEqual(len(__import__('re').findall(r'^다\.',page['text'],__import__('re').M)),2)
 def test_native_parallel_notification_fields_are_eight_siblings(self):
  doc=next((d for d in self.manifest['documents'] if d['sha256']=='25ef0494687bf942ebabde909478e218baf7a4d2ec2efe269198d478cd0a6d11'),None)
  if not doc:self.skipTest('Original rule revision not included in this release')
  text=self.data['documents'][doc['id']]['pages']['142']['text']
  expected=['가. 검역장소','나. 축주명','다. 품종','라. 수수','마. 원산지','바. 도입일자','사. 검역종료일','아. 예방접종등 기타 특기사항']
  self.assertTrue(all('\n'+label in text for label in expected));self.assertNotIn('검역장소 나.',text)
 def test_fee_rows_attach_parenthetical_method_text_and_keep_shared_disease_cell(self):
  cells=[(0,0,10,90),(10,0,20,90),(20,0,30,90),(30,0,40,90)]
  entries=[[(35,'질병')],[(8,'중화시험'),(30,'간이검사'),(50,'감별검사'),(64,'(효소면역법)')],[(10,'1두'),(33,'1두'),(56,'1두')],[(10,'4,800원'),(33,'2,600원'),(56,'4,700원')]]
  chars=[dict(x0=col*10+1,x1=col*10+2,top=y,bottom=y+10,text=s) for col,ls in enumerate(entries) for y,s in ls];page=SimpleNamespace(chars=chars)
  with patch('build_annex_layouts.text',side_effect=lambda cs:'\n'.join(c['text'] for c in cs)):
   result=aligned_fee_cells(page,cells)
   self.assertEqual(len(result),10);self.assertIn(cells[0],result)
   for c in chars:
    if 30<c['x0']<40:c['top']+=8;c['bottom']+=8
   self.assertEqual(aligned_fee_cells(page,cells),cells)
 def test_serology_method_quantity_and_fee_are_paired_with_wrapped_parenthetical_explanation(self):
  doc=next((d for d in self.manifest['documents'] if d['sha256']=='25ef0494687bf942ebabde909478e218baf7a4d2ec2efe269198d478cd0a6d11'),None)
  if not doc:self.skipTest('Original rule revision not included in this release')
  table=next(b for b in self.data['documents'][doc['id']]['pages']['149']['blocks'] if b['kind']=='table');rows=table['rows']
  for disease,expected in [('돼지오제스키병',[('혈청중화시험','1두','4,800원'),('간이진단킷트검사','1두','2,600원'),('감별진단킷트검사(항체효소면역법)','1두','4,700원')]),('돼지생식기호흡기증후군',[('간접형광항체법','1두','4,000원'),('효소면역법','1두','8,700원')]),('뉴캣슬병',[('혈구응집억제반응법','5수','16,300원'),('효소면역법','5수','18,300원')]),('조류인플루엔자',[('효소면역법','5수','18,800원'),('혈구응집억제반응법','5수','17,300원'),('한천겔침강반응법','5수','9,900원')])]:
   start=next(i for i,row in enumerate(rows) if any(c['col']==1 and c['text']==disease for c in row));self.assertEqual(next(c for c in rows[start] if c['col']==1)['rowspan'],len(expected))
   actual=[tuple(''.join(next(c['text'] for c in row if c['col']==col).split()) for col in [2,3,4]) for row in rows[start:start+len(expected)]];self.assertEqual(actual,expected)
 def test_sop_equipment_has_one_item_quantity_and_matching_remark_per_row(self):
  for id,page in [('7b763e5d-e1f8-5711-aedc-19ec89ab044f',193),('3d9ae693-1bb3-5f8c-af9e-0e3512252566',215)]:
   table=next(b for b in self.data['documents'][id]['pages'][str(page)]['blocks'] if b['kind']=='table');rows=table['rows'];self.assertEqual(len(rows),31)
   clean=lambda s:''.join(s.split())
   actual={clean(r[0]['text']):[clean(c['text']) for c in r[1:]] for r in rows[1:]}
   self.assertEqual(actual['비누'],['3개','물비누1개포함']);self.assertEqual(actual['고압스프레이어'],['1조','입구설치용']);self.assertEqual(actual['구급약품'],['1조','응급치료용']);self.assertEqual(actual['나침반'],['1개',''])
 def test_fmd_all_fifteen_appendices_have_native_layouts_and_equipment_rows(self):
  pages=self.data['documents']['de2a0c26-cb9d-4f83-b3f9-4d31f29fbbef']['pages']
  self.assertEqual(set(pages),{str(n) for n in range(287,327)})
  self.assertTrue(all(p['mode']!='image' for p in pages.values()))
  table=next(b for b in pages['319']['blocks'] if b['kind']=='table');self.assertEqual(len(table['rows']),31)
  rows={''.join(r[0]['text'].split()):[''.join(c['text'].split()) for c in r[1:]] for r in table['rows'][1:]}
  self.assertEqual(rows['비누'],['3개','물비누1개포함']);self.assertEqual(rows['고압스프레이어'],['1조','입구설치용']);self.assertEqual(rows['구급약품'],['1조','응급치료용'])
  body=''.join(b.get('text','') for b in pages['293']['blocks'] if not b.get('furniture'));self.assertIn('1.1',body);self.assertNotIn('별\n표\n/',body);self.assertFalse(body.strip().endswith('287'))
  self.assertTrue(any(b.get('furniture') and ''.join(b['text'].split())=='별표/별지' for b in pages['293']['blocks']))
  for n in [288,320,326]:
   figures=[b for b in pages[str(n)]['blocks'] if b['kind']=='image'];self.assertEqual(len(figures),1);self.assertTrue((ROOT/'site'/figures[0]['crop']['path']).exists())
 def test_residue_fee_child_methods_match_separate_unit_and_price_rows(self):
  p=self.data['documents']['1265dc44-6eb2-4934-a5a8-85b1f2f3638f']['pages']['157'];table=next(b for b in p['blocks'] if b['kind']=='table' and any('그 밖의 대동물' in c['text'] for r in b['rows'] for c in r));rows=table['rows'];start=next(i for i,r in enumerate(rows) if '그 밖의 대동물' in r[0]['text'])
  for row,expected in zip(rows[start:start+2],[('근육·피하주사제','6,180,000원'),('그 밖의 투여경로','4,944,000원')]):self.assertIn(expected[0],row[0]['text']);self.assertEqual(row[1]['text'],'1성분');self.assertEqual(row[2]['text'],expected[1])
 def test_figures_are_cropped_and_surrounding_sampling_instructions_are_native_text(self):
  for id,page,expected in [('7b763e5d-e1f8-5711-aedc-19ec89ab044f',191,['4. 시료 포장 및 운반요령','마. 모든 시료']),('3d9ae693-1bb3-5f8c-af9e-0e3512252566',197,['3.4 타 축종','3.5 시료 포장 방법']),('3d9ae693-1bb3-5f8c-af9e-0e3512252566',202,['□ 시료채취요령','VTM'])]:
   blocks=self.data['documents'][id]['pages'][str(page)]['blocks'];figures=[b for b in blocks if b['kind']=='image'];self.assertEqual(len(figures),1);self.assertTrue((ROOT/'site'/figures[0]['crop']['path']).exists());prose=''.join(b['text'] for b in blocks if b['kind']=='text')
   for word in expected:self.assertIn(word,prose)
 def test_text_boxes_and_nested_tables_in_hpai_annexes_do_not_require_page_image_fallbacks(self):
  pages=self.data['documents']['3d9ae693-1bb3-5f8c-af9e-0e3512252566']['pages']
  for n in [221,227,*range(278,290)]:
   page=pages[str(n)];self.assertNotEqual(page['mode'],'image');self.assertFalse(any(b['kind']=='image' for b in page.get('blocks',[])),n)
  for n in range(281,285):self.assertTrue(any(b['kind']=='table' and b['columns']==3 for b in pages[str(n)]['blocks']),n)
 def test_borderless_items_are_split_while_common_reference_stays_merged(self):
  p,cells=self.fake_grid([(5,'대상'),(30,'1) 농장'),(60,'2) 영업자')],[[(30,'100'),(60,'200')],[(30,'300'),(60,'400')]])
  with patch('build_annex_layouts.source_lines',side_effect=lambda cs:[(c['top'],c['text']) for c in cs]):result=detail_cells(p,cells)
  self.assertIn(cells[1],result);self.assertEqual(len(result),10)
  self.assertEqual([b[1] for b in result if b[0]==0],[0,28,58])
 def test_unaligned_amounts_do_not_get_paired_by_sequence(self):
  p,cells=self.fake_grid([(5,'대상'),(30,'1) 농장'),(60,'2) 영업자')],[[(30,'100'),(60,'200')],[(45,'300'),(60,'400')]])
  with patch('build_annex_layouts.source_lines',side_effect=lambda cs:[(c['top'],c['text']) for c in cs]):self.assertEqual(detail_cells(p,cells),cells)
 def test_nested_child_markers_do_not_assign_amounts_to_the_parent(self):
  p,cells=self.fake_grid([(5,'대상'),(20,'1) 농장'),(40,'가) 미작성'),(60,'나) 거짓기재')],[[(40,'50'),(60,'100')],[(40,'150'),(60,'200')]])
  with patch('build_annex_layouts.source_lines',side_effect=lambda cs:[(c['top'],c['text']) for c in cs]):result=detail_cells(p,cells)
  self.assertIn(cells[1],result);self.assertEqual([b[1] for b in result if b[0]==0],[0,18,38,58])
 def test_categorical_decisions_follow_child_rows_including_wrapped_durations(self):
  p,cells=self.fake_grid([(5,'대상'),(30,'가. 미신고'),(60,'나. 변경')],[[(30,'경고'),(60,'시정명령')],[(30,'업무정지'),(45,'1개월'),(60,'지정취소')]])
  with patch('build_annex_layouts.source_lines',side_effect=lambda cs:[(c['top'],c['text']) for c in cs]):result=detail_cells(p,cells)
  self.assertEqual([b[1] for b in result if b[0]==0],[0,28,58]);self.assertIn(cells[1],result)
 def test_notices_and_sop_have_source_bound_text_and_table_layouts(self):
  counts={}
  for doc in self.manifest['documents']:
   self.assertIn(doc['id'],self.data['documents'])
   if doc['type'] not in ['고시','SOP']:continue
   pages=self.data['documents'][doc['id']]['pages'];counts.setdefault(doc['type'],0)
   counts[doc['type']]+=sum(b['kind']=='table' for p in pages.values() for b in p.get('blocks',[]))
  self.assertGreater(counts['고시'],5);self.assertGreater(counts['SOP'],10)
 def test_embedded_formula_and_symbol_crops_are_source_bound_and_present(self):
  images=0
  for doc in self.manifest['documents']:
   for p in self.data['documents'][doc['id']]['pages'].values():
    for b in p.get('blocks',[]):
     for row in b.get('rows',[]):
      for cell in row:
       if not cell.get('crop'):continue
       image=cell['crop'];self.assertTrue(image['path'].startswith('assets/pages/'+doc['sha256']+'/'));self.assertTrue((ROOT/'site'/image['path']).exists());self.assertGreater(image['width'],0);self.assertGreater(image['height'],0);images+=1
  self.assertGreater(images,0)
 def test_dotted_score_rules_preserve_the_distinct_checklist_and_score_axes(self):
  _,pages=self.document('시행규칙');table=next(b for b in pages['99']['blocks'] if b['kind']=='table' and b['columns']==4)
  self.assertEqual(len(table['rows']),22)
  start=next(i for i,row in enumerate(table['rows']) if any(c['col']==0 and c['text'].startswith('1.') for c in row))
  checklist=next(c for c in table['rows'][start] if c['col']==1);self.assertEqual(checklist['rowspan'],5)
  self.assertEqual([next(c['text'] for c in row if c['col']==3) for row in table['rows'][start:start+5]],['10','8','6','4','0'])
 def test_prose_annexes_are_text_instead_of_page_images(self):
  _,decree=self.document('시행령');_,rule=self.document('시행규칙')
  for p in range(29,37):self.assertEqual(decree[str(p)]['mode'],'text')
  for p in [54,55,56,57,58,59,60,95,96,97,110,111,139,140,142,146]:self.assertEqual(rule[str(p)]['mode'],'text',p)
 def test_mixed_general_rules_are_not_trapped_in_images(self):
  _,pages=self.document('시행령');p=pages['26'];self.assertEqual(p['mode'],'mixed');self.assertTrue(any(b['kind']=='text' and '일반기준' in b['text'] for b in p['blocks']))
 def test_continued_tables_are_rebuilt_and_drawings_keep_original_layout(self):
  _,d=self.document('시행령');_,r=self.document('시행규칙')
  for p in ['26','27','28']:self.assertTrue(any(b['kind']=='table' for b in d[p]['blocks']));self.assertFalse(any(b['kind']=='image' for b in d[p]['blocks']))
  for p in [94,115,116,117,118,119,120,121,122,141]:self.assertEqual(r[str(p)]['mode'],'image')
 def test_no_textual_grid_falls_back_to_a_duplicate_page_image(self):
  for typ in ['시행령','시행규칙']:
   _,pages=self.document(typ)
   for n,p in pages.items():
    if p['mode']=='mixed':self.assertFalse(any(b['kind']=='image' for b in p['blocks']),f'{typ} {n}')
 def test_closed_simple_tables_are_selectable_text(self):
  _,pages=self.document('시행규칙');tables=[b for b in pages['69']['blocks'] if b['kind']=='table'];self.assertTrue(tables);self.assertEqual(tables[0]['columns'],2)
 def test_hpai_notice_equipment_has_eighteen_source_aligned_rows_and_sparse_quantities(self):
  pages=self.data['documents']['e6d52b81-681d-5e59-aa4c-63e78798e41e']['pages'];table=next(b for b in pages['26']['blocks'] if b['kind']=='table');rows=table['rows'][1:]
  self.assertEqual(len(rows),18)
  pairs=[(''.join(r[0]['text'].split()),''.join(r[1]['text'].split())) for r in rows]
  self.assertEqual(pairs[0][1],'6개');self.assertEqual(pairs[1][1],'6개');self.assertEqual([q for _,q in pairs[2:8]],['']*6)
  self.assertIn(('멸균목재압저(tonguedepressor)','축사별5개'),pairs);self.assertIn(('1회용주사기3㎖','축사별20개'),pairs);self.assertEqual(pairs[-1][1],'20벌')
 def test_source_hash_and_every_converted_character_and_merged_cell(self):
  converted=0
  for doc in self.manifest['documents']:
   if doc['id'] not in self.data['documents']:continue
   item=self.data['documents'][doc['id']];self.assertEqual(item['source_sha256'],hashlib.sha256((ROOT/'site'/doc['pdf']).read_bytes()).hexdigest())
   with pdfplumber.open(ROOT/'site'/doc['pdf']) as pdf:
    for n,layout in item['pages'].items():
     blocks=layout.get('blocks',[])
     for b in [b for b in blocks if b['kind']=='table']:
      slots=set()
      for rownum,row in enumerate(b['rows']):
       for c in row:
        cells={(r,col) for r in range(rownum,rownum+c['rowspan']) for col in range(c['col'],c['col']+c['colspan'])};self.assertFalse(slots.intersection(cells));slots.update(cells)
      self.assertEqual(len(slots),len(b['rows'])*b['columns'])
     if layout['mode']!='mixed' or any(b['kind']=='image' for b in blocks):continue
     shown=''.join(b['text'] if b['kind']=='text' else ''.join(c['text'] for row in b['rows'] for c in row) for b in blocks)
     self.assertEqual(count(shown),count(''.join(c['text'] for c in pdf.pages[int(n)-1].chars)),f'{doc["type"]} page {n}');converted+=1
  self.assertGreater(converted,5)
if __name__=='__main__':unittest.main()
