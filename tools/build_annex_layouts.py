"""Build source-bound text/table layouts. Ambiguous grids and drawings retain source images."""
import hashlib,json,os,subprocess,re
from pathlib import Path
from collections import Counter
import pdfplumber
from sop_visuals import fingerprint
from prose_flow import restore_prose
from pdfplumber.table import merge_edges
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
# Reviewed drawings/labels: dimensions and relative positions carry meaning.
DRAWINGS={'25ef0494687bf942ebabde909478e218baf7a4d2ec2efe269198d478cd0a6d11':set([94,*range(115,123),141])}
FIGURE_CROPS={
 'f317fe10748e2a09e84db8098071ee71a0d9609490a35428479e6caccb8f3e60':{288:[[83,126,518,453]],320:[[95,193,501,430]],326:[[82,126,518,421]]},
 '8ca92a9774fa4ca4af353140f4fed9741297780d189aeadd5ac72e26153fec4a':{191:[[70,95,520,258]]},
 'a2b814c1053b54f9e772628e60f5dee7abe2e841b3ae69efedc026a6d5a9995d':{197:[[145,85,410,245]],202:[[140,480,415,657]]},
}

def decoration_candidate(im,page):
 return (im['width']*im['height']>page.width*page.height*.88
  or im['width']<page.width*.17 and im['height']>page.height*.65
  or im['width']>page.width*.82 and im['height']<page.height*.2
  or im['x0']>page.width*.85 and im['width']<page.width*.1
  or im['top']<page.height*.2 and im['height']<page.height*.025 and im['width']<page.width*.2)

def sidebar_chars(page):
 chars=[c for c in page.chars if c['x0']>page.width*.88 and c['bottom']<page.height*.4]
 return chars if re.sub(r'\s','',''.join(c['text'] for c in chars))=='별표/별지' else []

def footer_chars(page,title):
 chars=[c for c in page.chars if c['top']>page.height*.86]
 raw=re.sub(r'\s','',''.join(c['text'] for c in chars));title=re.sub(r'\s','',title)
 value=raw.replace(title,'').replace('⚫','')
 return (chars,int(value)) if value.isdigit() and 1<=len(value)<=4 and ('⚫' in raw or title in raw) else ([],None)
def centre(c,b):return b[0]-.2<=(c['x0']+c['x1'])/2<=b[2]+.2 and b[1]-.2<=(c['top']+c['bottom'])/2<=b[3]+.2
def text(chars):return restore_prose(chars,pdfplumber.utils.extract_text(chars,x_tolerance=2,y_tolerance=3) or '')
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

def aligned_amount_cells(p,cells):
 """Split unnumbered payment rows only with matching source label/value baselines.
 Common side cells stay merged; identical repeated notes may follow their own rows.
 """
 replacements={}
 for value in cells:
  amounts=source_lines(cell_chars(p,value))
  if len(amounts)<2 or not all(re.fullmatch(r'\d[\d,]*(?:\.\d+)?',line) and float(line.replace(',',''))>=1000 for _,line in amounts):continue
  labels=next((box for box in cells if abs(box[2]-value[0])<1 and abs(box[1]-value[1])<1 and abs(box[3]-value[3])<1),None)
  if not labels:continue
  descriptions=source_lines(cell_chars(p,labels))
  if len(descriptions)!=len(amounts) or not all(abs(y-a)<4 and re.search(r'[가-힣A-Za-z]',line) for (y,line),(a,_) in zip(descriptions,amounts)):continue
  cuts=[y-2 for y,_ in amounts[1:]];targets=[labels,value]
  for other in cells:
   if other[0]<value[2]-1 or abs(other[1]-value[1])>1 or abs(other[3]-value[3])>1:continue
   notes=source_lines(cell_chars(p,other))
   if len(notes)>1 and len({line for _,line in notes})==1 and all(any(abs(y-a)<4 for a,_ in amounts) for y,_ in notes):targets.append(other)
  if any(any(c['top']<cut<c['bottom'] for c in cell_chars(p,box)) for box in targets for cut in cuts):continue
  for box in targets:
   boundaries=[box[1],*cuts,box[3]];replacements[tuple(box)]=[(box[0],a,box[2],b) for a,b in zip(boundaries,boundaries[1:])]
 return [part for box in cells for part in replacements.get(tuple(box),[box])]

def aligned_fee_cells(p,cells):
 """Restore method / unit / won-fee triples, including parenthesized wraps.
 Price and unit baselines must agree; all method groups need spatial evidence.
 """
 def lines(chars):
  return [{'chars':group,'text':text(group).strip()} for group in pdfplumber.utils.cluster_objects(chars,lambda c:c['top'],3) if group]
 def compact(value):return re.sub(r'\s','',value)
 def centers(chars):return [(c['top']+c['bottom'])/2 for c in chars if c['text'].strip()]
 def middle(chars):
  points=centers(chars);return (min(points)+max(points))/2
 replacements={}
 for price in cells:
  price_chars=cell_chars(p,price)
  if sum(c['text'].count('원') for c in price_chars)<2:continue
  fees=lines(price_chars)
  if len(fees)<2 or not all(re.fullmatch(r'\d[\d,]*(?:\.\d+)?원',compact(line['text'])) for line in fees):continue
  def left_of(box):return next((b for b in cells if abs(b[2]-box[0])<1 and abs(b[1]-box[1])<1 and abs(b[3]-box[3])<1),None)
  unit=left_of(price);method=left_of(unit) if unit else None
  if not unit or not method:continue
  units=lines(cell_chars(p,unit))
  if len(units)!=len(fees) or not all(re.fullmatch(r'\d+(?:\.\d+)?(?:두|수|건|개|매|마리|점|명|회|성분)',compact(line['text'])) for line in units):continue
  if any(abs(middle(u['chars'])-middle(f['chars']))>3 for u,f in zip(units,fees)):continue
  methods=[]
  for line in lines(cell_chars(p,method)):
   prior=text(methods[-1]) if methods else ''
   continued=methods and (line['text'].startswith(('(','（')) or prior.count('(')+prior.count('（')>prior.count(')')+prior.count('）'))
   if continued:methods[-1].extend(line['chars'])
   else:methods.append(list(line['chars']))
  if len(methods)==len(fees)+1 and all(re.match(r'^\d+\)',text(group).strip()) for group in methods[1:]):methods=[methods[0]+methods[1],*methods[2:]]
  if len(methods)!=len(fees) or not all(re.search(r'[가-힣A-Za-z]',text(group)) for group in methods):continue
  groups=[[*m,*u['chars'],*f['chars']] for m,u,f in zip(methods,units,fees)]
  if any(abs(middle(m)-middle(u['chars']))>max(c['bottom']-c['top'] for c in [*m,*u['chars']])*.9 for m,u in zip(methods,units)):continue
  cuts=[]
  for left,right in zip(groups,groups[1:]):
   lo=max(centers(left));hi=min(centers(right))
   if hi-lo<=1:break
   cuts.append((lo+hi)/2)
  if len(cuts)!=len(fees)-1:continue
  targets=[method,unit,price]
  if any(centre(im,box) for im in getattr(p,'annex_images',[]) for box in targets):continue
  for box in targets:
   boundaries=[box[1],*cuts,box[3]];replacements[tuple(box)]=[(box[0],a,box[2],b) for a,b in zip(boundaries,boundaries[1:])]
 return [part for box in cells for part in replacements.get(tuple(box),[box])]

def equipment_cells(p,cells):
 """Use quantity baselines to restore one equipment item per row.
 Wrapped labels and sparse remarks stay with the matching source baseline.
 """
 replacements={}
 for unit in cells:
  entries=source_lines(cell_chars(p,unit))
  if len(entries)<3 or not all(re.fullmatch(r'(?:각\s*)?[\d,]+\s*(?:개|조|부|벌|짝|켤레|켈레|권|봉지|리터|㎏|kg|회\s*용\s*\(개\))',line) for _,line in entries):continue
  label=next((b for b in cells if abs(b[2]-unit[0])<1 and abs(b[1]-unit[1])<1 and abs(b[3]-unit[3])<1),None)
  if not label:continue
  labels=source_lines(cell_chars(p,label))
  if not all(any(abs(y-z)<4 for z,_ in labels) for y,_ in entries):continue
  targets=[b for b in cells if b[0]>=label[0] and abs(b[1]-unit[1])<1 and abs(b[3]-unit[3])<1]
  groups=[[] for _ in entries]
  for box in targets:
   for chars in pdfplumber.utils.cluster_objects(cell_chars(p,box),lambda c:c['top'],3):
    y=min(c['top'] for c in chars);i=min(range(len(entries)),key=lambda j:abs(entries[j][0]-y));groups[i].extend(chars)
  if any(not g for g in groups):continue
  cuts=[]
  for left,right in zip(groups,groups[1:]):
   lo=max((c['top']+c['bottom'])/2 for c in left);hi=min((c['top']+c['bottom'])/2 for c in right)
   if hi-lo<1:break
   cuts.append((lo+hi)/2)
  if len(cuts)!=len(entries)-1:continue
  for box in targets:
   limits=[box[1],*cuts,box[3]];replacements[tuple(box)]=[(box[0],a,box[2],b) for a,b in zip(limits,limits[1:])]
 return [part for box in cells for part in replacements.get(tuple(box),[box])]

def table_block(p,t):
 cells=equipment_cells(p,aligned_fee_cells(p,aligned_amount_cells(p,detail_cells(p,t.cells))))
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
def page_layout(p,number,drawings,decorations=frozenset(),reviewed_crops=(),recover_frames=True):
 if reviewed_crops:
  blocks=[];top=0
  for box in sorted(reviewed_crops,key=lambda b:b[1]):
   before=[c for c in p.chars if top<=(c['top']+c['bottom'])/2<box[1]]
   if before:blocks.append({'kind':'text','text':text(before)})
   blocks.append({'kind':'image','cropBox':box,'reason':'reviewed-figure-with-caption'})
   top=box[3]
  after=[c for c in p.chars if (c['top']+c['bottom'])/2>=top]
  if after:blocks.append({'kind':'text','text':text(after)})
  return {'mode':'mixed','blocks':blocks}
 images=[im for im in p.images if not (fingerprint(im) in decorations and decoration_candidate(im,p))]
 if number in drawings or p.curves or any(im['width']*im['height']>p.width*p.height*.015 for im in images):return {'mode':'image','reason':'drawing'}
 p.annex_images=images
 # Recover page-boundary grids from their original vertical rules, closing only
 # the clipped physical top/bottom. Cell divisions still come from source rules.
 edges=[e for e in merge_edges(p.edges,3,3,3,3) if abs(e['x1']-e['x0'])<1 and e['bottom']-e['top']>25]
 groups=[]
 for e in sorted(edges,key=lambda e:e['top']):
  if groups and e['top']<=max(x['bottom'] for x in groups[-1])+3:groups[-1].append(e)
  else:groups.append([e])
 expanded=[]
 for group in groups:
  # A decorative outer frame can enclose introductory prose and a real table.
  # Recover the inner grid rather than treating the whole frame as one table.
  bounds=union([[e['x0'],e['top'],e['x1'],e['bottom']] for e in group])
  inner=[e for e in group if bounds[0]+4<e['x0']<bounds[2]-4 and e['top']>bounds[1]+4 and e['bottom']<bounds[3]-4]
  subgroups=[]
  for edge in inner:
   same=next((g for g in subgroups if abs(g[0]['top']-edge['top'])<3 and abs(g[0]['bottom']-edge['bottom'])<3),None)
   if same is None:subgroups.append([edge])
   else:same.append(edge)
  valid=bool(subgroups) and all(len({round(e['top']) for e in p.edges if e.get('orientation')=='h' and e['x0']<min(v['x0'] for v in g)-3 and e['x1']>max(v['x0'] for v in g)+3 and g[0]['top']-2<=e['top']<=g[0]['bottom']+2})>=3 for g in subgroups)
  expanded.extend(subgroups if valid and recover_frames else [group])
 regions=[]
 for group in expanded:
  box=union([[e['x0'],e['top'],e['x1'],e['bottom']] for e in group])
  # Some PDFs draw outer vertical borders only in the header. Their repeated
  # horizontal row rules still provide the exact original left/right extent.
  rules=[e for e in p.edges if e.get('orientation')=='h' and e['x1']-e['x0']>20 and box[1]-2<=e['top']<=box[3]+2 and e['x0']<=box[2]+2 and e['x1']>=box[0]-2]
  if rules:box=union([box,*[[e['x0'],max(box[1],e['top']),e['x1'],min(box[3],e['bottom'])] for e in rules]])
  if box[2]-box[0]<20:continue
  # Keep sub-point dash segments before joining, otherwise score rows disappear.
  tables=p.crop(box).find_tables({'explicit_horizontal_lines':[box[1],box[3]],'explicit_vertical_lines':[box[0],box[2]],'edge_min_length_prefilter':0})
  candidates=[t for t in tables if len(t.columns)>1]
  if len(candidates)==1:regions.append({'bbox':list(candidates[0].bbox),'table':candidates[0]})
  else:regions.append({'bbox':box,'table':None})
 if not regions:
  if images:return {'mode':'image','reason':'embedded-symbol'}
  native=text(p.chars)
  if count(native)!=count(''.join(c['text'] for c in p.chars)):return {'mode':'image','reason':'text-coverage-mismatch'}
  return {'mode':'text','text':native}

 if any(not any(centre(im,r['bbox']) for r in regions) for im in images):return {'mode':'image','reason':'embedded-symbol'}
 regions.sort(key=lambda r:r['bbox'][1]);blocks=[];top=0
 for r in regions:
  b=r['bbox'];outside=[c for c in p.chars if top<=(c['top']+c['bottom'])/2<b[1]-.2]
  if outside:blocks.append({'kind':'text','text':text(outside)})
  block=table_block(p,r['table']) if r['table'] else None
  if not block and not r['table'] and not any(centre(im,b) for im in images):
   # A single-column closed frame contains prose, not parallel data columns.
   inside=[e for e in edges if b[0]+3<e['x0']<b[2]-3 and e['bottom']>b[1]+3 and e['top']<b[3]-3]
   if not inside:block={'kind':'text','text':text(cell_chars(p,b))}
  if not block:
   # A partial/ambiguous row must remain attached to its original page.
   blocks.append({'kind':'image','reason':'open-or-ambiguous-grid'})
  else:blocks.append(block)
  top=b[3]+.2
 outside=[c for c in p.chars if (c['top']+c['bottom'])/2>=top]
 if outside:blocks.append({'kind':'text','text':text(outside)})
 if not any(b['kind']=='image' for b in blocks):
  shown=''.join(b['text'] if b['kind']=='text' else ''.join(c['text'] for row in b['rows'] for c in row) for b in blocks)
  if count(shown)!=count(''.join(c['text'] for c in p.chars)):
   if recover_frames:return page_layout(p,number,drawings,decorations,reviewed_crops,recover_frames=False)
   return {'mode':'image','reason':'coverage-mismatch'}
 return {'mode':'mixed','blocks':blocks}
def materialise_cells(layout,number,doc,page):
 cells=[c for b in layout.get('blocks',[]) if b['kind']=='table' for row in b['rows'] for c in row if c.get('cropBox')]+[b for b in layout.get('blocks',[]) if b.get('cropBox')]
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
   repeated=Counter();sidebars=0;footer_offsets=Counter()
   for number in numbers:
    page=pdf.pages[number-1]
    repeated.update(set(fingerprint(im) for im in page.images if decoration_candidate(im,page)))
    sidebars+=bool(sidebar_chars(page))
    footer,printed=footer_chars(page,doc['title'])
    if footer:footer_offsets[printed-number]+=1
   decorations={key for key,n in repeated.items() if n>=3}
   for n in numbers:
    original=pdf.pages[n-1];margin=sidebar_chars(original) if sidebars>=3 else [];footer,printed=footer_chars(original,doc['title'])
    footer=footer if sidebars>=3 and footer and footer_offsets[printed-n]>=3 else []
    decorations_text=[cs for cs in [margin,footer] if cs];excluded_ids={id(c) for cs in decorations_text for c in cs}
    page=original.filter(lambda obj:id(obj) not in excluded_ids) if excluded_ids else original
    layout=page_layout(page,n,drawings,decorations,FIGURE_CROPS.get(doc['sha256'],{}).get(n,()))
    # Preserve verified margin characters in audit data, outside body/table flow.
    if decorations_text and layout['mode']!='image':
     if layout['mode']=='text':layout={'mode':'mixed','blocks':[{'kind':'text','text':layout['text']}]}
     for chars in decorations_text:layout['blocks'].append({'kind':'text','text':text(chars),'furniture':True,'sourceBox':union([[c['x0'],c['top'],c['x1'],c['bottom']] for c in chars])})
    materialise_cells(layout,n,doc,original);pages[str(n)]=layout
   for layout in pages.values():stats[layout['mode']]+=1
  output['documents'][doc['id']]={'source_sha256':doc['sha256'],'pages':pages}
 target=ROOT/'site/data/annex-layouts.json';target.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf-8');print('Annex layouts:',dict(stats),flush=True)
 return output
if __name__=='__main__':build()
