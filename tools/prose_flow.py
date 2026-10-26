"""Restore a wrapped Korean sentence ending only with paragraph/label geometry evidence."""
import re
from pdfplumber import utils
LETTERS='가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토포호'
LABEL=re.compile(r'^(['+LETTERS+r'])\.[ \t]+\S')

def join_sentence_endings(raw,rows):
    # Never infer offsets if the coordinate lines do not reproduce the extraction.
    if raw!='\n'.join(row['text'] for row in rows):return raw
    labels=[(i,LABEL.match(row['text'])) for i,row in enumerate(rows) if LABEL.match(row['text'])]
    joined=set()
    for pos,(i,match) in enumerate(labels):
        if match[1]!='다' or not i or not re.search(r'[가-힣]$',rows[i-1]['text']):continue
        previous=next(((j,m) for j,m in reversed(labels[:pos]) if j not in joined),None)
        following=labels[pos+1] if pos+1<len(labels) else None
        if not previous or not following:continue
        j,prior=previous;k,nxt=following;current=rows[i];parent=rows[j];last=rows[i-1];next_row=rows[k]
        height=max(1,current['bottom']-current['top'],last['bottom']-last['top'])
        if not 0<current['top']-last['top']<=height*2.2:continue
        if current['x0']-parent['x0']<max(3,height*.5):continue
        if abs(next_row['x0']-parent['x0'])>2 or LETTERS.index(nxt[1])!=LETTERS.index(prior[1])+1:continue
        same_body=abs(current['x0']-last['x0'])<=2 and last['x0']>parent['x0']+3
        first_body=parent.get('chars',[])[2:3]
        short_wrap=i-1==j and bool(first_body) and parent['x0']+height*.5<=current['x0']<=first_body[0]['x0']+2
        if same_body or short_wrap:joined.add(i)
    return ''.join(('' if i in joined else '\n')+row['text'] if i else row['text'] for i,row in enumerate(rows))

def restore_prose(chars,raw):
    if not re.search(r'\n다\.[ \t]',raw):return raw
    rows=utils.chars_to_textmap(chars,x_tolerance=2,y_tolerance=3,layout=False).extract_text_lines(return_chars=True)
    return join_sentence_endings(raw,rows)
