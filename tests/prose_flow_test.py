import sys,unittest,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from prose_flow import join_sentence_endings,restore_prose,parallel_item_breaks

def row(text,x,y):return dict(text=text,x0=x,top=y,bottom=y+12)
def fields(left,right,y,second=230):
    text=left+' '+right;chars=[]
    for label,start in [(left,75),(right,second)]:
        x=start
        for letter in label:
            if not letter.isspace():chars.append(dict(text=letter,x0=x,x1=x+6))
            x+=6
    return dict(text=text,x0=75,top=y,bottom=y+12,chars=chars)
class ProseFlow(unittest.TestCase):
 def test_continuation_da_joins_without_changing_any_nonwhitespace_character(self):
  rows=[row('마. 농장 출입자는 다음을 준수한다.',75,100),row('농장 출입 전후 소독을 실시하여야 한',90,120),row('다. 방문자는 축사에 들어가지 않도록 한다.',90,140),row('바. 소독액을 교체한다.',75,160)];raw='\n'.join(r['text'] for r in rows);clean=join_sentence_endings(raw,rows)
  self.assertIn('하여야 한다. 방문자는',clean);self.assertNotIn('\n다. 방문자는',clean);self.assertEqual(re.sub(r'\s','',raw),re.sub(r'\s','',clean))
 def test_real_da_at_the_marker_margin_is_preserved_even_if_previous_line_ends_in_han(self):
  rows=[row('나. 이전 목의 마지막 단어는 한',75,100),row('다. 실제 다목을 규정한다.',75,120),row('라. 다음 목',75,140)];raw='\n'.join(r['text'] for r in rows);self.assertEqual(join_sentence_endings(raw,rows),raw)
 def test_nested_letters_ambiguous_spacing_or_different_next_scope_are_not_rewritten(self):
  cases=[[row('나. 상위 목',75,100),row('안쪽 줄의 마지막 글자는 한',90,120),row('다. 실제 하위 목',90,140),row('라. 다음 하위 목',90,160)],[row('마. 상위 목',75,100),row('문장 끝은 한',90,120),row('다. 다른 문단',90,180),row('바. 다음 목',75,200)],[row('마. 상위 목',75,100),row('한',90,120),row('다. 문장',90,140)]]
  for rows in cases:
   raw='\n'.join(r['text'] for r in rows);self.assertEqual(join_sentence_endings(raw,rows),raw)
 def test_single_wrapped_line_uses_the_actual_first_body_character_position(self):
  parent=row('마. 소독을 실시하여야 한',75,100);parent['chars']=[{'x0':75},{'x0':86},{'x0':98}];rows=[parent,row('다. 방문자는 다음을 준수한다.',90,120),row('바. 다음 목',75,140)];self.assertIn('한다. 방문자는',join_sentence_endings('\n'.join(r['text'] for r in rows),rows))
 def test_parallel_fields_are_split_only_when_columns_sequence_and_multiple_rows_agree(self):
  rows=[fields('가. 장소','나. 소유자',100),fields('다. 품종','라. 수수',120),fields('마. 원산지','바. 도입일자',140)];raw='\n'.join(r['text'] for r in rows);clean=join_sentence_endings(raw,rows,split_columns=True)
  self.assertEqual(clean,'가. 장소 \n나. 소유자\n다. 품종 \n라. 수수\n마. 원산지 \n바. 도입일자');self.assertEqual(re.sub(r'\s','',raw),re.sub(r'\s','',clean));self.assertEqual(len(parallel_item_breaks(rows)),3)
 def test_inline_references_single_rows_and_nonmatching_columns_are_not_split(self):
  cases=[[fields('가. 장소','나. 소유자',100)],[fields('가. 앞에서 나. 참고','다. 범위',100),fields('라. 앞에서 마. 참고','바. 범위',120)],[fields('가. 장소','나. 소유자',100,125),fields('다. 품종','라. 수수',120,125)],[fields('가. 장소','나. 소유자',100),fields('다. 품종','라. 수수',120,260)]]
  for rows in cases:self.assertEqual(parallel_item_breaks(rows),{})
 def test_real_rule_annex_14_5_parallel_fields_become_eight_siblings_in_original_order(self):
  import pdfplumber
  source=ROOT/'site/pdf/1265dc44-6eb2-4934-a5a8-85b1f2f3638f.pdf'
  if not source.exists():self.skipTest('Original rule revision not included in this checkout')
  with pdfplumber.open(source) as pdf:
   chars=pdf.pages[141].chars;raw=pdfplumber.utils.extract_text(chars,x_tolerance=2,y_tolerance=3);clean=restore_prose(chars,raw)
   self.assertIn('가. 검역장소 나. 축주명',raw)
   for label in ['가. 검역장소','나. 축주명','다. 품종','라. 수수','마. 원산지','바. 도입일자','사. 검역종료일','아. 예방접종등 기타 특기사항']:self.assertIn('\n'+label,clean)
   self.assertEqual(re.sub(r'\s','',raw),re.sub(r'\s','',clean))
 def test_real_rule_annex_2_4_keeps_both_actual_da_items_and_repairs_the_wrapped_sentence(self):
  import pdfplumber
  source=ROOT/'site/pdf/1265dc44-6eb2-4934-a5a8-85b1f2f3638f.pdf'
  if not source.exists():self.skipTest('Original rule revision not included in this checkout')
  with pdfplumber.open(source) as pdf:
   chars=pdf.pages[94].chars;raw=pdfplumber.utils.extract_text(chars,x_tolerance=2,y_tolerance=3);clean=restore_prose(chars,raw)
   self.assertIn('실시하여야 한\n다. 방문자는',raw);self.assertIn('실시하여야 한다. 방문자는',clean);self.assertEqual(len(re.findall(r'^다\.',clean,re.M)),2);self.assertEqual(re.sub(r'\s','',raw),re.sub(r'\s','',clean))
if __name__=='__main__':unittest.main()
