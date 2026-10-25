"""Geometry-based SOP visual extraction. Original pages remain available separately."""
import hashlib,json
from collections import Counter
from pathlib import Path
import pdfplumber

def fingerprint(image):
    return hashlib.sha256(image['stream'].get_data()).hexdigest()
def box(obj):return (obj['x0'],obj['top'],obj['x1'],obj['bottom'])
def area(b):return max(0,b[2]-b[0])*max(0,b[3]-b[1])
def union(boxes):return (min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes))
def colorful(c):return isinstance(c,(list,tuple)) and len(c)>=3 and max(c[:3])-min(c[:3])>.16
def cluster(boxes,gap=22):
    groups=[]
    for b in boxes:
        touch=[g for g in groups if not (b[2]+gap<g[0] or g[2]+gap<b[0] or b[3]+gap<g[1] or g[3]+gap<b[1])]
        for g in touch:groups.remove(g)
        groups.append(union([b,*touch]))
    return groups
def lines(page):
    rows={}
    for word in page.extract_words():rows.setdefault(round(word['top']/4)*4,[]).append(word)
    return [(union([box(w) for w in ws]),' '.join(w['text'] for w in sorted(ws,key=lambda w:w['x0']))) for _,ws in sorted(rows.items())]
def prose_raster(bounds,rows):
    import statistics
    text=[t for b,t in rows if bounds[0]<=sum(b[::2])/2<=bounds[2] and bounds[1]<=sum(b[1::2])/2<=bounds[3]]
    return len(text)>=4 and sum(map(len,text))>160 and statistics.median(map(len,text))>24

def with_caption(bounds,rows,width,height):
    x0,y0,x1,y1=bounds
    # Keep captions and consecutive notes; stop at a separate numbered section.
    import re
    for b,text in reversed(rows):
        if b[3]<=y0 and y0-b[3]<24 and (re.match(r'^[<〈「\[]?(?:그림|표|사진|도\s*\d|참고|붙임)',text) or len(text)<65 and not re.match(r'^\d+(?:\.\d+)*[. ]',text)):
            x0=min(x0,b[0]);x1=max(x1,b[2]);y0=b[1];break
    in_note=False
    for b,text in rows:
        if b[1]<y1-2:continue
        if b[1]-y1>26:break
        note=bool(re.match(r'^(?:주\s*[:：)]|주\d|비고|※|\*|출처|자료\s*[:：]|[<〈\[]?(?:그림|표|사진))',text))
        if not note and (not in_note or re.match(r'^\d+(?:\.\d+)*[. ]',text)):break
        x0=min(x0,b[0]);x1=max(x1,b[2]);y1=b[3];in_note=True
    return [max(0,x0-9),max(0,y0-9),min(width,x1+9),min(height,y1+9)]
def analyse(path,index,overrides=None):
    overrides=overrides or {};result={};bg=Counter()
    with pdfplumber.open(path) as document:
        for p in document.pages:
            seen=set()
            for im in p.images:
                w,h=im['width'],im['height']
                if w*h>p.width*p.height*.88 or w<p.width*.17 and h>p.height*.65 or w>p.width*.82 and h<p.height*.2:seen.add(fingerprint(im))
            bg.update(seen);p.close()
        decorations={k for k,n in bg.items() if n>=3}
        for n,p in enumerate(document.pages,1):
            w,h=p.width,p.height;page_area=w*h;text=(index['pages'][n-1]['text'] or '').strip();rows=lines(p)
            images=[]
            for im in p.images:
                b=box(im);bw,bh=b[2]-b[0],b[3]-b[1]
                if fingerprint(im) in decorations or min(bw,bh)<2 or area(b)<page_area*.0001:continue
                if b[1]<h*.24 and bh<h*.085 and bw/max(bh,1)>5:continue # running title ribbon
                if b[1]<h*.08 or b[3]>h*.96 or b[0]>w*.87 and bw<w*.15:continue
                if bw>w*.85 and bh>h*.85 and len(text)<160:continue # cover/section divider
                images.append(b)
            raster=[b for b in cluster(images) if area(b)>page_area*.006 and b[3]-b[1]>h*.055 and not prose_raster(b,rows)]
            tables=[]
            for t in p.find_tables():
                if len(t.rows)>=2 and len(t.columns)>=2 and area(t.bbox)>page_area*.035:tables.append(t.bbox)
            colored=[box(r) for r in [*p.rects,*p.curves] if colorful(r.get('non_stroking_color')) and r.get('width',0)>15 and r.get('height',0)>12 and r['top']>h*.12 and r['bottom']<h*.95]
            diagrams=cluster(colored,45) if len(colored)>=3 else []
            diagrams=[b for b in diagrams if area(b)>page_area*.06 and b[3]-b[1]>h*.14]
            frames=[box(r) for r in p.rects if r['width']>20 and r['height']>12 and r['top']>h*.18 and r['bottom']<h*.95]
            connectors=[box(l) for l in p.lines if max(l['width'],l['height'])>12 and l['top']>h*.18 and l['bottom']<h*.95]
            if len(frames)>=4 and len(connectors)>=20:diagrams.append(union(frames))
            elif len(connectors)>=35:
                bounds=union(connectors)
                chars=sum(len(t) for b,t in rows if b[0]>=bounds[0] and b[2]<=bounds[2] and b[1]>=bounds[1] and b[3]<=bounds[3])
                if area(bounds)>page_area*.08 and chars/max(1,area(bounds))<.012:diagrams.append(bounds)
            candidates=cluster([*raster,*tables,*diagrams],12)
            regions=[with_caption(b,rows,w,h) for b in candidates]
            classification='table' if tables else 'illustration' if regions else 'text'
            if n in overrides.get('exclude',[]):regions=[];classification='divider'
            if n in overrides.get('text_only',[]):regions=[];classification='text'
            if str(n) in overrides.get('regions',{}):regions=overrides['regions'][str(n)];classification='illustration'
            if n in overrides.get('full_pages',[]):regions=[[0,0,w,h]];classification='table'
            result[str(n)]={'kind':classification,'mode':'crop','regions':regions,'page_width':w,'page_height':h,'text_chars':len(text)}
            p.close()
    # A continued grid table is deliberately not cropped, so headers/notes remain intact.
    for n in range(1,len(result)):
        a,b=result[str(n)],result[str(n+1)]
        if a['kind']=='table' and b['kind']=='table' and a['regions'] and b['regions']:
            a['mode']=b['mode']='full'
    for n in overrides.get('full_pages',[]):result[str(n)]['mode']='full'
    return result

if __name__=='__main__':
    root=Path(__file__).resolve().parents[1];manifest=json.loads((root/'site/data/manifest.json').read_text(encoding='utf-8'))
    profiles=json.loads((root/'maintenance/visual-overrides.json').read_text(encoding='utf-8'));output={}
    for doc in manifest['documents']:
        if doc['type']!='SOP':continue
        index=json.loads((root/'site'/doc['data']).read_text(encoding='utf-8'))
        output[doc['sha256']]=analyse(root/'site'/doc['pdf'],index,profiles.get(doc['sha256']))
        print(doc['title'],Counter(p['kind'] for p in output[doc['sha256']].values()),flush=True)
    dest=root/'private/visual-audit.json';dest.parent.mkdir(exist_ok=True);dest.write_text(json.dumps(output,ensure_ascii=False),encoding='utf-8')
