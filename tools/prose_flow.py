"""Restore prose paragraph flow only with source label/column geometry evidence."""
import re
from pdfplumber import utils
LETTERS='가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토포호'
LABEL=re.compile(r'^(['+LETTERS+r'])\.[ \t]+\S')

def join_sentence_endings(raw,rows,split_columns=False):
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
    columns=parallel_item_breaks(rows) if split_columns else {}
    output=[]
    for i,row in enumerate(rows):
        value=row['text']
        for offset in reversed(columns.get(i,[])):value=value[:offset]+'\n'+value[offset:]
        output.append(('' if not i or i in joined else '\n')+value)
    return ''.join(output)

INLINE_LABEL=re.compile(r'(?<!\S)(['+LETTERS+r'])\.[ \t]+')

def parallel_item_breaks(rows):
    """At least two physical rows must agree on columns and sequential labels.
    Wide blank gaps distinguish fields from short inline cross-references.
    """
    candidates={}
    for i,row in enumerate(rows):
        matches=list(INLINE_LABEL.finditer(row['text']))
        if len(matches)<2 or matches[0].start()!=0:continue
        sequence=[LETTERS.index(m[1]) for m in matches]
        if any(b!=a+1 for a,b in zip(sequence,sequence[1:])):continue
        glyphs=[];positions=[]
        for char in row.get('chars',[]):
            for letter in char['text']:
                if not letter.isspace():glyphs.append(letter);positions.append(char)
        if ''.join(glyphs)!=re.sub(r'\s','',row['text']):continue
        height=max(1,row['bottom']-row['top']);columns=[];valid=True
        for j,m in enumerate(matches):
            at=len(re.sub(r'\s','',row['text'][:m.start()]));columns.append(positions[at]['x0'])
            if j and columns[-1]-positions[at-1]['x1']<max(24,height*1.8):valid=False;break
            end=matches[j+1].start() if j+1<len(matches) else len(row['text'])
            if not row['text'][m.end():end].strip() or len(row['text'][m.end():end].strip())>50:valid=False;break
        if valid:candidates[i]={'columns':columns,'sequence':sequence,'offsets':[m.start() for m in matches[1:]],'height':height}
    result={};run=[]
    def finish():
        if len(run)>=2:
            for n in run:result[n]=candidates[n]['offsets']
        run.clear()
    for i,row in enumerate(rows):
        current=candidates.get(i)
        if not current:finish();continue
        if run:
            previous=candidates[run[-1]]
            same=len(current['columns'])==len(previous['columns']) and all(abs(a-b)<=2 for a,b in zip(current['columns'],previous['columns']))
            ordered=current['sequence'][0]==previous['sequence'][-1]+1
            adjacent=0<row['top']-rows[run[-1]]['top']<=max(current['height'],previous['height'])*2.4
            if not (same and ordered and adjacent):finish()
        run.append(i)
    finish();return result

def restore_prose(chars,raw):
    if not re.search(r'\n다\.[ \t]|[ \t]['+LETTERS+r']\.[ \t]',raw):return raw
    rows=utils.chars_to_textmap(chars,x_tolerance=2,y_tolerance=3,layout=False).extract_text_lines(return_chars=True)
    return join_sentence_endings(raw,rows,split_columns=True)
