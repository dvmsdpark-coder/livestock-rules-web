"""Build source-bound text/table layouts. Ambiguous grids and drawings retain source images."""
import hashlib,json,os,subprocess
from pathlib import Path
from collections import Counter
import pdfplumber
ROOT=Path(__file__).resolve().parents[1]
# Reviewed drawings/labels: dimensions and relative positions carry meaning.
DRAWINGS={'25ef0494687bf942ebabde909478e218baf7a4d2ec2efe269198d478cd0a6d11':set([94,*range(115,123),141])}
def centre(c,b):return b[0]-.2<=(c['x0']+c['x1'])/2<=b[2]+.2 and b[1]-.2<=(c['top']+c['bottom'])/2<=b[3]+.2
def text(chars):return pdfplumber.utils.extract_text(chars,x_tolerance=2,y_tolerance=3) or ''
def count(s):return Counter(c for c in s if not c.isspace())
def union(boxes):return [min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes)]
def table_block(p,t):
 xs=sorted(set(round(v,2) for c in t.cells for v in (c[0],c[2])));ys=sorted(set(round(v,2) for c in t.cells for v in (c[1],c[3])))
 rows=[[] for _ in ys[:-1]];captured=[];occupied=set()
 for box in sorted(t.cells,key=lambda b:(b[1],b[0])):
  x0,y0,x1,y1=map(lambda v:round(v,2),box);chars=[c for c in p.chars if centre(c,box)]
  slots={(r,c) for r in range(ys.index(y0),ys.index(y1)) for c in range(xs.index(x0),xs.index(x1))}
  if occupied.intersection(slots):return None
  occupied.update(slots)
  captured.extend(chars);rows[ys.index(y0)].append({'col':xs.index(x0),'colspan':xs.index(x1)-xs.index(x0),'rowspan':ys.index(y1)-ys.index(y0),'text':text(chars)})
 if len(occupied)!=(len(xs)-1)*(len(ys)-1):return None
 body=[c for c in p.chars if centre(c,t.bbox)]
 if count(''.join(c['text'] for c in body))!=count(''.join(c['text'] for c in captured)):return None
 return {'kind':'table','rows':rows,'columns':len(xs)-1,'widths':[round((xs[i+1]-xs[i])/(xs[-1]-xs[0])*100,2) for i in range(len(xs)-1)]}
def page_layout(p,number,drawings):
 if number in drawings or p.images or p.curves:return {'mode':'image','reason':'drawing'}
 tables=[t for t in p.find_tables() if len(t.columns)>1 and t.bbox[3]-t.bbox[1]>24]
 regions=[{'bbox':list(t.bbox),'table':t} for t in tables]
 # Open-ended tables at physical page boundaries are not always found by find_tables.
 edges=[e for e in p.edges if abs(e['x1']-e['x0'])<1 and e['bottom']-e['top']>25]
 loose=[e for e in edges if not any(r['bbox'][0]-.5<=e['x0']<=r['bbox'][2]+.5 and r['bbox'][1]-.5<=e['top'] and e['bottom']<=r['bbox'][3]+.5 for r in regions)]
 if loose:
  box=union([[e['x0'],e['top'],e['x1'],e['bottom']] for e in loose]);overlap=[r for r in regions if r['bbox'][1]<=box[3]+3 and r['bbox'][3]>=box[1]-3]
  box=union([box]+[r['bbox'] for r in overlap]);regions=[r for r in regions if r not in overlap]+[{'bbox':box,'table':None}]
 if not regions:return {'mode':'text'}
 regions.sort(key=lambda r:r['bbox'][1]);blocks=[];top=0
 for r in regions:
  b=r['bbox'];outside=[c for c in p.chars if top<=(c['top']+c['bottom'])/2<b[1]-.2]
  if outside:blocks.append({'kind':'text','text':text(outside)})
  block=table_block(p,r['table']) if r['table'] else None
  if not block:
   # A partial/ambiguous row must remain attached to its original page.
   blocks.append({'kind':'image','reason':'open-or-ambiguous-grid'})
  else:blocks.append(block)
  top=b[3]+.2
 outside=[c for c in p.chars if (c['top']+c['bottom'])/2>=top]
 if outside:blocks.append({'kind':'text','text':text(outside)})
 if not any(b['kind']=='image' for b in blocks):
  shown=''.join(b['text'] if b['kind']=='text' else ''.join(c['text'] for row in b['rows'] for c in row) for b in blocks)
  if count(shown)!=count(''.join(c['text'] for c in p.chars)):return {'mode':'image','reason':'coverage-mismatch'}
 return {'mode':'mixed','blocks':blocks}
def build():
 listing=json.loads(subprocess.check_output([os.environ.get('NODE_BINARY','node'),'tools/list-annex-layouts.mjs'],cwd=ROOT));output={'schema':1,'documents':{}};stats=Counter()
 for entry in listing:
  doc=entry['doc'];source=ROOT/'site'/doc['pdf']
  if hashlib.sha256(source.read_bytes()).hexdigest()!=doc['sha256']:raise ValueError('PDF hash mismatch')
  pages={};drawings=DRAWINGS.get(doc['sha256'],set())
  with pdfplumber.open(source) as pdf:
   for n in sorted(set(n for a in entry['annexes'] for n in range(a['part']['page'],a['endPage']+1))):
    layout=page_layout(pdf.pages[n-1],n,drawings);pages[str(n)]=layout
   # Preserve an entire run when table rows cross physical page boundaries.
   continued=set()
   for n in sorted(map(int,pages)):
    if str(n+1) not in pages or not any(a['part']['page']<=n<n+1<=a['endPage'] for a in entry['annexes']):continue
    a=pdf.pages[n-1];b=pdf.pages[n]
    bottom=any(abs(e['x1']-e['x0'])<1 and e['bottom']>a.height-100 and e['bottom']-e['top']>25 for e in a.edges)
    top=any(abs(e['x1']-e['x0'])<1 and e['top']<90 and e['bottom']-e['top']>25 for e in b.edges)
    if bottom and top:continued.update([n,n+1])
   for n in continued:
    for block in pages[str(n)].get('blocks',[]):
     if block['kind']=='table':block.clear();block.update({'kind':'image','reason':'continued-grid'})
   for layout in pages.values():
    if any(b['kind']=='image' for b in layout.get('blocks',[])):
     for block in layout['blocks']:
      if block['kind']=='table':block.clear();block.update({'kind':'image','reason':'same-source-page'})
    stats[layout['mode']]+=1
  output['documents'][doc['id']]={'source_sha256':doc['sha256'],'pages':pages}
 target=ROOT/'site/data/annex-layouts.json';target.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf-8');print('Annex layouts:',dict(stats),flush=True)
 return output
if __name__=='__main__':build()
