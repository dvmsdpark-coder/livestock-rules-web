"""Build source-bound text/table layouts. Ambiguous grids and drawings retain source images."""
import hashlib,json,os,subprocess,re
from pathlib import Path
from collections import Counter
import pdfplumber
from sop_visuals import fingerprint
from pdfplumber.table import merge_edges
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
# Reviewed drawings/labels: dimensions and relative positions carry meaning.
DRAWINGS={'25ef0494687bf942ebabde909478e218baf7a4d2ec2efe269198d478cd0a6d11':set([94,*range(115,123),141])}
def centre(c,b):return b[0]-.2<=(c['x0']+c['x1'])/2<=b[2]+.2 and b[1]-.2<=(c['top']+c['bottom'])/2<=b[3]+.2
def text(chars):return pdfplumber.utils.extract_text(chars,x_tolerance=2,y_tolerance=3) or ''
def count(s):return Counter(c for c in s if not c.isspace())
def union(boxes):return [min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes)]
def horizontal_closed(p,x0,x1,y):
 segments=sorted((e['x0'],e['x1']) for e in p.edges if abs(e['bottom']-e['top'])<1 and abs(e['top']-y)<2 and e['x1']>x0 and e['x0']<x1)
 end=x0
 for a,b in segments:
  if a>end+2:break
  end=max(end,b)
 return end>=x1-2

def cell_chars(p,box):return [c for c in p.chars if centre(c,box)]

def source_lines(chars):
 return [(min(c['top'] for c in line),text(line).strip()) for line in pdfplumber.utils.cluster_objects(chars,lambda c:c['top'],3) if line]

ACTION=r'(?:경고|시정명령|업무정지|영업정지|지정취소|영업소폐쇄|허가취소|등록취소|사육제한|폐쇄|취소|이하|이상|또는|및|개월|일|년|월|시간|[0-9,./ㆍ·()])+?'
def value_kind(lines):
 compact=''.join(line for _,line in lines).replace(' ','')
 if compact and re.fullmatch(r'[\d,.]+',compact):return 'number'
 if compact and re.fullmatch(ACTION,compact):return 'action'
 return None

def detail_cells(p,cells):
 """Restore source-aligned child rows for amounts AND categorical decisions.
 A common reference stays merged until the next separately positioned reference.
 """
 replacements={}
 for box in cells:
  lines=source_lines(cell_chars(p,box));items=[(y,m.group(1)) for y,line in lines if (m:=re.match(r'^((?:\d{1,2}|[가-힣]))[).]\s*',line))]
  if not items:continue
  limits=[max(box[1],y-2) for y,_ in items]+[box[3]];peers=[];references=[];unresolved=False
  for other in cells:
   if other==box or abs(other[1]-box[1])>1 or abs(other[3]-box[3])>1:continue
   values=source_lines(cell_chars(p,other));kind=value_kind(values)
   if not values:continue
   bands=[[(y,line) for y,line in values if limits[i]<=y<limits[i+1]] for i in range(len(items))]
   occupied=[i for i,band in enumerate(bands) if band]
   if not kind:
    if any(re.search(r'(?:법|제\s*\d+\s*조)',line) for _,line in values) and occupied and (len(occupied)>1 or occupied[0]>0) and all(abs(bands[i][0][0]-items[i][0])<5 for i in occupied):references.append((other,occupied))
    continue
   valid=all((abs(bands[i][0][0]-items[i][0])<5 and len(bands[i])==1) if kind=='number' else len(re.findall(r'경고|시정명령|업무정지|영업정지|지정취소|영업소폐쇄|허가취소|등록취소|사육제한|폐쇄|취소',''.join(line for _,line in bands[i]).replace(' ','')))==1 for i in occupied)
   if valid and occupied:peers.append((other,occupied))
   else:unresolved=True
  if unresolved or len(peers)<2:continue
  # Do not split a rule merely because it contains examples with one shared value.
  if len(items)>1 and all(len(occupied)==1 and occupied[0]==0 for _,occupied in peers):continue
  cuts=[y for y in limits[:-1] if box[1]+4<y<box[3]-4 and any((c['top']+c['bottom'])/2<y for c in cell_chars(p,box))]
  targets=[(box,cuts)]+[(other,cuts) for other,_ in peers]
  targets += [(other,[limits[i] for i in occupied if i>0 and limits[i] in cuts]) for other,occupied in references]
  for target,divisions in targets:
   boundaries=[target[1],*divisions,target[3]];replacements[tuple(target)]=[(target[0],a,target[2],b) for a,b in zip(boundaries,boundaries[1:])]
 return [part for box in cells for part in replacements.get(tuple(box),[box])]

def table_block(p,t):
 cells=detail_cells(p,t.cells)
 xs=sorted(set(round(v,2) for c in cells for v in (c[0],c[2])));ys=sorted(set(round(v,2) for c in cells for v in (c[1],c[3])))
 rows=[[] for _ in ys[:-1]];captured=[];occupied=set()
 for box in sorted(cells,key=lambda b:(b[1],b[0])):
  x0,y0,x1,y1=map(lambda v:round(v,2),box);chars=[c for c in p.chars if centre(c,box)]
  slots={(r,c) for r in range(ys.index(y0),ys.index(y1)) for c in range(xs.index(x0),xs.index(x1))}
  if occupied.intersection(slots):return None
  occupied.update(slots)
  embedded=[im for im in getattr(p,'annex_images',[]) if centre(im,box)]
  if any(im['x0']<x0-1 or im['x1']>x1+1 or im['top']<y0-1 or im['bottom']>y1+1 for im in embedded):return None
  captured.extend(chars);rows[ys.index(y0)].append({'cropBox':list(box) if embedded else None,'col':xs.index(x0),'colspan':xs.index(x1)-xs.index(x0),'rowspan':ys.index(y1)-ys.index(y0),'text':text(chars),'openTop':abs(y0-ys[0])<1 and not horizontal_closed(p,x0,x1,y0),'openBottom':abs(y1-ys[-1])<1 and not horizontal_closed(p,x0,x1,y1)})
 if len(occupied)!=(len(xs)-1)*(len(ys)-1):return None
 body=[c for c in p.chars if centre(c,t.bbox)]
 if count(''.join(c['text'] for c in body))!=count(''.join(c['text'] for c in captured)):return None
 return {'kind':'table','xs':xs,'rows':rows,'columns':len(xs)-1,'widths':[round((xs[i+1]-xs[i])/(xs[-1]-xs[0])*100,2) for i in range(len(xs)-1)]}
def page_layout(p,number,drawings,decorations=frozenset()):
 images=[im for im in p.images if fingerprint(im) not in decorations]
 if number in drawings or p.curves or any(im['width']*im['height']>p.width*p.height*.015 for im in images):return {'mode':'image','reason':'drawing'}
 p.annex_images=images
 # Recover page-boundary grids from their original vertical rules, closing only
 # the clipped physical top/bottom. Cell divisions still come from source rules.
 edges=[e for e in merge_edges(p.edges,3,3,3,3) if abs(e['x1']-e['x0'])<1 and e['bottom']-e['top']>25]
 groups=[]
 for e in sorted(edges,key=lambda e:e['top']):
  if groups and e['top']<=max(x['bottom'] for x in groups[-1])+3:groups[-1].append(e)
  else:groups.append([e])
 regions=[]
 for group in groups:
  box=union([[e['x0'],e['top'],e['x1'],e['bottom']] for e in group])
  # Some PDFs draw outer vertical borders only in the header. Their repeated
  # horizontal row rules still provide the exact original left/right extent.
  rules=[e for e in p.edges if e.get('orientation')=='h' and e['x1']-e['x0']>20 and box[1]-2<=e['top']<=box[3]+2 and e['x0']<=box[2]+2 and e['x1']>=box[0]-2]
  if rules:box=union([box,*[[e['x0'],max(box[1],e['top']),e['x1'],min(box[3],e['bottom'])] for e in rules]])
  if box[2]-box[0]<20:continue
  # Keep sub-point dash segments before joining, otherwise score rows disappear.
  tables=p.crop(box).find_tables({'explicit_horizontal_lines':[box[1],box[3]],'explicit_vertical_lines':[box[0],box[2]],'edge_min_length_prefilter':0})
  candidates=[t for t in tables if len(t.columns)>1]
  if len(candidates)==1:regions.append({'bbox':box,'table':candidates[0]})
  else:regions.append({'bbox':box,'table':None})
 if not regions:return {'mode':'image','reason':'embedded-symbol'} if images else {'mode':'text'}
 if any(not any(centre(im,r['bbox']) for r in regions) for im in images):return {'mode':'image','reason':'embedded-symbol'}
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
def materialise_cells(layout,number,doc,page):
 cells=[c for b in layout.get('blocks',[]) if b['kind']=='table' for row in b['rows'] for c in row if c.get('cropBox')]
 if not cells:return
 source=ROOT/'site/assets/pages'/doc['sha256']/f'{number}.webp'
 if not source.exists():raise ValueError('Build page previews before annex cell visuals')
 with Image.open(source) as image:
  for cell in cells:
   box=cell.pop('cropBox');coords=[max(0,int(box[0]/page.width*image.width)),max(0,int(box[1]/page.height*image.height)),min(image.width,int(box[2]/page.width*image.width+1)),min(image.height,int(box[3]/page.height*image.height+1))]
   signature=hashlib.sha256(json.dumps(coords).encode()).hexdigest()[:12];path=f'assets/pages/{doc["sha256"]}/annex-cell-{number}-{signature}.webp';target=ROOT/'site'/path
   crop=image.crop(coords)
   if not target.exists():crop.save(target,'WEBP',quality=90,method=4)
   cell['crop']={'path':path,'width':crop.width,'height':crop.height};crop.close()

def build():
 listing=json.loads(subprocess.check_output([os.environ.get('NODE_BINARY','node'),'tools/list-annex-layouts.mjs'],cwd=ROOT));output={'schema':1,'documents':{}};stats=Counter()
 for entry in listing:
  doc=entry['doc'];source=ROOT/'site'/doc['pdf']
  if hashlib.sha256(source.read_bytes()).hexdigest()!=doc['sha256']:raise ValueError('PDF hash mismatch')
  pages={};drawings=DRAWINGS.get(doc['sha256'],set());numbers=sorted(set(n for a in entry['annexes'] for n in range(a['part']['page'],a['endPage']+1)))
  with pdfplumber.open(source) as pdf:
   repeated=Counter()
   for number in numbers:
    page=pdf.pages[number-1]
    repeated.update(set(fingerprint(im) for im in page.images if im['width']*im['height']>page.width*page.height*.88 or im['width']<page.width*.17 and im['height']>page.height*.65 or im['width']>page.width*.82 and im['height']<page.height*.2))
   decorations={key for key,n in repeated.items() if n>=3}
   for n in numbers:
    layout=page_layout(pdf.pages[n-1],n,drawings,decorations);materialise_cells(layout,n,doc,pdf.pages[n-1]);pages[str(n)]=layout
   for layout in pages.values():stats[layout['mode']]+=1
  output['documents'][doc['id']]={'source_sha256':doc['sha256'],'pages':pages}
 target=ROOT/'site/data/annex-layouts.json';target.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf-8');print('Annex layouts:',dict(stats),flush=True)
 return output
if __name__=='__main__':build()
