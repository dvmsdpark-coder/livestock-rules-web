"""Extract SOP section headings from source typography, not body wording.

The inventory is tied to each immutable PDF. A small-font numbered procedure
cannot become a top-level section merely because it starts a physical page.
"""
import hashlib,json,re
from pathlib import Path
import pdfplumber

ROOT=Path(__file__).resolve().parents[1]

def divider_heading(value,document_title=''):
    match=re.search(r'(?:^|\n)\s*제\s*(\d+)\s*장\s*\n(.+)',value,re.S)
    if not match:return None
    prefix=value[:match.start()].replace(document_title,'').replace('⚫','')
    if not re.fullmatch(r'[\d\s-]*',prefix):return None
    title=[]
    for line in match[2].splitlines():
        if re.match(r'^\s*(?:\d+[.)]|※|별표|별지)',line):break
        if line.strip():title.append(re.sub(r'(?<![가-힣])(?:[가-힣] ){2,}[가-힣](?![가-힣])',lambda m:m[0].replace(' ',''),line.strip()))
    return '제'+match[1]+'장 '+re.sub(r'\s+',' ',' '.join(title))if title else None

def build():
    result={}
    manifest=json.loads((ROOT/'site/data/manifest.json').read_text(encoding='utf-8'))
    for doc in manifest['documents']:
        if doc['type']!='SOP':continue
        path=ROOT/'site'/doc['pdf']
        if hashlib.sha256(path.read_bytes()).hexdigest()!=doc['sha256']:raise ValueError('Source PDF changed')
        headings=[];chapters=[];chapter_number=None
        index=json.loads((ROOT/'site'/doc['data']).read_text(encoding='utf-8'))
        # Decorative divider lettering may extract as '3 / 제 장'. Use the
        # verified index label for those short pages, not a body-text guess.
        for page in index['pages']:
            label=divider_heading(page['text'],doc['title'])
            if label:chapters.append({'page':page['page'],'heading':label,'topRatio':0,'divider':True})
        with pdfplumber.open(path) as pdf:
            # Main numbered headings use a font at least 1.25 times the median
            # prose size. The font-size test is independent of heading wording.
            from collections import Counter
            sizes=Counter()
            for p in pdf.pages:
                sizes.update(round(c['size'],1) for c in p.chars if re.search('[가-힣]',c['text']))
                p.close()
            prose=sizes.most_common(1)[0][0]
            threshold=prose*1.25
            for number,p in enumerate(pdf.pages,1):
                all_rows=pdfplumber.utils.cluster_objects(p.chars,lambda c:c['top'],4)
                for row in all_rows:
                    label=(pdfplumber.utils.extract_text(row,x_tolerance=3,y_tolerance=4) or '').strip()
                    match=re.match(r'^제\s*(\d+)\s*장\s+.+',label)
                    if match and max(c['size'] for c in row)>=threshold:
                        chapter_number=int(match[1]);chapters.append({'page':number,'heading':label,'topRatio':round(min(c['top'] for c in row)/p.height,8)})
                    if doc['disease']=='구제역' and re.fullmatch(r'용어\s*정의',label):
                        headings.append({'page':number,'heading':label,'top':round(min(c['top'] for c in row),2),'topRatio':round(min(c['top'] for c in row)/p.height,8),'fontSize':round(min(c['size'] for c in row),2),'subsection':True})
                    if doc['disease']=='ASF' and chapter_number==1 and re.match(r'^1\.\d+\s+[^.]+$',label) and 12<min(c['size'] for c in row)<16:
                        headings.append({'page':number,'heading':label,'top':round(min(c['top'] for c in row),2),'topRatio':round(min(c['top'] for c in row)/p.height,8),'fontSize':round(min(c['size'] for c in row),2),'subsection':True})
                    if doc['disease']=='ASF' and chapter_number==2 and not match and min(c['size'] for c in row)>=20 and len(label)<70:
                        headings.append({'page':number,'heading':label,'top':round(min(c['top'] for c in row),2),'topRatio':round(min(c['top'] for c in row)/p.height,8),'fontSize':round(min(c['size'] for c in row),2),'subsection':True})
                chars=[c for c in p.chars if c['size']>=threshold and 20<c['top']<p.height-35]
                rows=pdfplumber.utils.cluster_objects(chars,lambda c:c['top'],4)
                for row in rows:
                    label=(pdfplumber.utils.extract_text(row,x_tolerance=3,y_tolerance=4) or '').strip()
                    if not re.match(r'^\d{1,2}\.?\s+[가-힣A-Za-z]',label):continue
                    # Preserve small-font parentheticals on the same title line.
                    y=sum((c['top']+c['bottom'])/2 for c in row)/len(row)
                    full=[c for c in p.chars if abs((c['top']+c['bottom'])/2-y)<4]
                    label=(pdfplumber.utils.extract_text(full,x_tolerance=3,y_tolerance=4) or label).strip()
                    if not re.match(r'^\d{1,2}\.?\s+[가-힣A-Za-z]',label):continue
                    headings.append({'page':number,'heading':label,'top':round(min(c['top'] for c in row),2),'topRatio':round(min(c['top'] for c in row)/p.height,8),'fontSize':round(min(c['size'] for c in row),2)})
                p.close()
        main_size=Counter(h['fontSize'] for h in headings).most_common(1)[0][0]
        headings=[h for h in headings if h.get('subsection') or h['fontSize']>=main_size-.3]
        chapters=sorted({(c['page'],c['heading']):c for c in chapters}.values(),key=lambda c:c['page'])
        result[doc['sha256']]={'proseSize':prose,'headings':headings,'chapters':chapters}
        print(doc['id'],len(headings),'source headings',flush=True)
    (ROOT/'site/assets/sop-structure.js').write_text('// Generated by tools/build_sop_structure.py from immutable PDF typography.\nexport const sopStructure='+json.dumps(result,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')

if __name__=='__main__':build()
