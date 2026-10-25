import sys,json,unittest,hashlib
from pathlib import Path
import pdfplumber
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from build_annex_layouts import count
class AnnexLayouts(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.data=json.loads((ROOT/'site/data/annex-layouts.json').read_text(encoding='utf-8'));cls.manifest=json.loads((ROOT/'site/data/manifest.json').read_text(encoding='utf-8'))
 def document(self,typ):
  doc=next(d for d in self.manifest['documents'] if d['type']==typ);return doc,self.data['documents'][doc['id']]['pages']
 def test_prose_annexes_are_text_instead_of_page_images(self):
  _,decree=self.document('시행령');_,rule=self.document('시행규칙')
  for p in range(29,37):self.assertEqual(decree[str(p)]['mode'],'text')
  for p in [54,55,56,57,58,59,60,95,96,97,110,111,139,140,142,146]:self.assertEqual(rule[str(p)]['mode'],'text',p)
 def test_mixed_general_rules_are_not_trapped_in_images(self):
  _,pages=self.document('시행령');p=pages['26'];self.assertEqual(p['mode'],'mixed');self.assertTrue(any(b['kind']=='text' and '일반기준' in b['text'] for b in p['blocks']))
 def test_continued_tables_and_dimensioned_drawings_keep_original_layout(self):
  _,d=self.document('시행령');_,r=self.document('시행규칙')
  for p in ['26','27','28']:self.assertTrue(any(b['kind']=='image' for b in d[p]['blocks']));self.assertFalse(any(b['kind']=='table' for b in d[p]['blocks']))
  for p in [94,115,116,117,118,119,120,121,122,141]:self.assertEqual(r[str(p)]['mode'],'image')
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
