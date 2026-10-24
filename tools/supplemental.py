"""Reviewed source boundaries, bound to the exact supplied PDF revision.

PDF page numbers, not printed page numbers. Never reuse boundaries for a new hash.
"""
import re
try:
 from app.articles import page_body
except ModuleNotFoundError as error:
 if not error.name.startswith("app"):raise
 from notice_parser import page_body

PROFILES = {
 '8ca92a9774fa4ca4af353140f4fed9741297780d189aeadd5ac72e26153fec4a': {
  'scenario':'제3장 아프리카돼지열병 발생시 긴급 대처요령',
  'exclude':[(1,2),(205,281)],
  'procedures':[
   ('reporting',40,40,'1. 의심축 발생신고시 조치사항','2. 아프리카돼지열병'),
   ('movement_release',168,169,'18. 방역지역별 이동제한 해제 및 종식','19. 살처분'),
   ('farm_disinfection',117,124,'9. 발생농장의 청소․세척 및 소독요령','10. 역학조사')],
 },
 'a2b814c1053b54f9e772628e60f5dee7abe2e841b3ae69efedc026a6d5a9995d': {
  'scenario':'제4장 고병원성 조류인플루엔자 발생 시 표준행동요령',
  'exclude':[(1,8)],
  'procedures':[
   ('reporting',89,89,'2 의심축 신고 및 의사환축 발생 시 조치사항','2. 의심축 발생 신고 접수'),
   ('movement_release',179,181,'13 이동제한 해제 요령','14 발생농장'),
   ('farm_disinfection',158,165,'10 발생농장 등의 청소･세척 및 소독요령','11 이동통제초소')],
 },
}

# Also accept the SOP notation 제3의1호, alongside 법령 notation 제3호의1.
ANNEX = re.compile(r'(?m)^[ \t]*(?:[■□][^\n\[]*)?[\[〔](별지|별표)\s*(?:제\s*)?(\d+)(?:\s*호\s*의\s*(\d+)|\s*의\s*(\d+)\s*호?|\s*호)?\s*(?:서식)?[\]〕]([^\n]*)')

def excluded(profile,page):
 return any(start<=page<=end for start,end in profile.get('exclude',[]))

def curated_procedures(pages,profile):
 by_page={p['page']:p for p in pages}
 result=[]
 for intent,start,end,heading,next_heading in profile.get('procedures',[]):
  # Guard both boundaries before treating a multi-page passage as complete.
  compact=lambda s:re.sub(r'\s+','',s)
  if compact(heading) not in compact(by_page[start]['text_content'][:240]):
   raise ValueError('SOP start boundary changed')
  if compact(next_heading) not in compact(by_page[end+1]['text_content'][:240]):
   raise ValueError('SOP end boundary changed')
  parts=[]
  for n in range(start,end+1):
   page=by_page[n]; text=page['text_content']
   # Remove only page furniture; every excerpt stays an exact source substring.
   text=re.sub(r'\A\s*(?:-\s*\d+\s*-|\d+)\s*\n','',text,count=1).strip()
   if text:parts.append({**page,'text_content':text})
  result.append({'intent':intent,'scenario':profile['scenario'],'heading':heading,'parts':parts})
 return result

def parse_annexes(pages,title):
 result=[]; current=None
 for page in pages:
  text=page_body(page['text_content'],title); matches=list(ANNEX.finditer(text))
  if not matches:
   if current:current['parts'].append({**page,'text_content':text})
   continue
  if current and matches[0].start():current['parts'].append({**page,'text_content':text[:matches[0].start()]})
  for i,m in enumerate(matches):
   end=matches[i+1].start() if i+1<len(matches) else len(text)
   following=text[m.end():end].strip().splitlines(); subtitle=following[0].strip() if following else ''
   heading=m.group().strip()
   if subtitle and len(subtitle)<100 and not subtitle.startswith(('(','[','※')):heading+=' · '+subtitle
   current={'section_kind':'form' if m.group(1)=='별지' else 'table','number':(m.group(2),m.group(3) or m.group(4)),
    'heading':heading,'deleted':bool(re.search(r'삭제\s*<',m.group(5))),
    'parts':[{**page,'text_content':text[m.start():end]}]}
   result.append(current)
 return result
