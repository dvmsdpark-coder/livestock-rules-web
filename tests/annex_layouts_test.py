import sys,json,unittest,hashlib
from pathlib import Path
import pdfplumber
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from build_annex_layouts import count,detail_cells
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
