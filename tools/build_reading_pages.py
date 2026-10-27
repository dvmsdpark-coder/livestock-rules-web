"""Build source-coordinate reading text and SOP grids without changing immutable indexes."""
import json,re,hashlib
from pathlib import Path
from collections import Counter
import pdfplumber
from page_furniture import confirmed_furniture,NUMBER
from build_annex_layouts import text,table_block,centre,union,materialise_cells
from pdf_geometry import render_box,pixel_box
from PIL import Image,ImageDraw
from build_sop_structure import divider_heading
ROOT=Path(__file__).resolve().parents[1]
def compact(s):return re.sub(r'\s|\x00','',s)
def normalized(s):return Counter(c for c in s if not c.isspace() and c!='\x00')
def lines(chars):
 if not chars:return []
 result=[]
 for row in pdfplumber.utils.chars_to_textmap(chars,x_tolerance=2,y_tolerance=3,layout=False).extract_text_lines(return_chars=True):
  if not row['text'].strip():continue
  result.append({'text':row['text'].replace('\x00',' '),'box':[round(row[k],3)for k in ['x0','top','x1','bottom']]})
 return result

def margin_candidates(page,rows,number):
    # Native geometry does not depend on PDF text-stream order. In particular,
    # an odd-page footer number may precede a separate decorative bullet.
    values=[(r['box'],r['text'])for r in rows]
    values += [([w['x0'],w['top'],w['x1'],w['bottom']],w['text'])for w in page.extract_words()]
    found=[]
    for box,label in values:
        match=NUMBER.fullmatch(label.strip().replace('⚫','').strip())
        if not match:continue
        edge='top'if box[3]<=page.height*.12 else 'bottom'if box[1]>=page.height*.86 else None
        if not edge:continue
        if any(v['number']==int(match[1])and abs(v['box'][0]-box[0])<1 and abs(v['box'][1]-box[1])<1 for v in found):continue
        found.append({'text':label,'number':int(match[1]),'page':number,'edge':edge,'source_edge':'geometry','context':'','box':box,'band':round(box[1]/page.height,2)})
    return found

def source_table(page,table):
 block=table_block(page,table)
 if block:return block
 # Some source grids omit the outside vertical rule below their header. Close
 # only the known table extent; interior rules and merged cells remain native.
 box=table.bbox
 for candidate in page.crop(box).find_tables({'explicit_vertical_lines':[box[0],box[2]],'explicit_horizontal_lines':[box[1],box[3]],'edge_min_length_prefilter':0}):
  if len(candidate.columns)!=len(table.columns):continue
  block=table_block(page,candidate)
  if block:return block
 return None

def clean_margin_images(blocks,number_boxes,page,doc,preview):
    for block in blocks:
        if block['kind']!='image':continue
        source_box=block['sourceBox'];masks=[b for b in number_boxes if min(b[2],source_box[2])>max(b[0],source_box[0]) and min(b[3],source_box[3])>max(b[1],source_box[1])]
        if not masks:continue
        with Image.open(ROOT/'site'/preview['path'])as full:
            coords=pixel_box(source_box,render_box(page),full.width,full.height);crop=full.crop(tuple(coords));draw=ImageDraw.Draw(crop)
            for box in masks:
                pixels=pixel_box(box,render_box(page),full.width,full.height)
                rect=[max(0,pixels[0]-coords[0]-1),max(0,pixels[1]-coords[1]-1),min(crop.width-1,pixels[2]-coords[0]+1),min(crop.height-1,pixels[3]-coords[1]+1)]
                draw.rectangle(rect,fill='white')
            signature=hashlib.sha256(json.dumps([coords,masks]).encode()).hexdigest()[:12];dest=ROOT/'site/assets/pages'/doc['sha256']/f'reading-clean-number-{page.page_number}-{signature}.webp'
            if not dest.exists():crop.save(dest,'WEBP',quality=86,method=4)
            block['crop']={'path':dest.relative_to(ROOT/'site').as_posix(),'width':crop.width,'height':crop.height,'bytes':dest.stat().st_size,'maskedNumbers':masks};crop.close()

def build(document_id=None):
 structure_source=(ROOT/'site/assets/sop-structure.js').read_text(encoding='utf8');structure=json.loads(structure_source.split('=',1)[1].rstrip(';\n'));manifest=json.loads((ROOT/'site/data/manifest.json').read_text(encoding='utf8'));previews=json.loads((ROOT/'site/data/page-previews.json').read_text(encoding='utf8'));output=json.loads((ROOT/'site/data/reading-pages.json').read_text(encoding='utf8'))if document_id else {'schema':1,'documents':{}};stats=Counter()
 for doc in manifest['documents']:
  if document_id and doc['id']!=document_id:continue
  source=ROOT/'site'/doc['pdf'];assert hashlib.sha256(source.read_bytes()).hexdigest()==doc['sha256'];pages={};candidates=[];sidebars=Counter();index=json.loads((ROOT/'site'/doc['data']).read_text(encoding='utf8'))
  with pdfplumber.open(source)as pdf:
   for n,p in enumerate(pdf.pages,1):
    ls=lines(p.chars);rows=[(l['box'],l['text'])for l in ls];raw='\n'.join(l['text']for l in ls);candidates+=margin_candidates(p,ls,n)
    side=[c for c in p.chars if c['x0']>p.width*.88 and c['bottom']<p.height*.4]
    key=compact(''.join(c['text']for c in side))
    if re.fullmatch(r'[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+[가-힣/]+|별표/별지',key):sidebars[key]+=1
    p.close()
   confirmed=confirmed_furniture(candidates)
   for n,p in enumerate(pdf.pages,1):
    excluded=[];boxes=[r['box']for r in confirmed.get(str(n),[])]
    side=[c for c in p.chars if c['x0']>p.width*.88 and c['bottom']<p.height*.4];key=compact(''.join(c['text']for c in side))
    if sidebars[key]>=3 and side:boxes.append(union([[c['x0'],c['top'],c['x1'],c['bottom']]for c in side]))
    # A repeated footer title and its printed number form a single margin band.
    bottom=[c for c in p.chars if c['top']>p.height*.86];raw=compact(''.join(c['text']for c in bottom));title=compact(doc['title'])
    rest=raw.replace(title,'').replace('⚫','')
    if title in raw and rest.isdigit() and len(rest)<=4 and bottom:boxes.append(union([[c['x0'],c['top'],c['x1'],c['bottom']]for c in bottom]))
    kept=[]
    for c in p.chars:
     (excluded if any(centre(c,b)for b in boxes)else kept).append(c)
    page={'width':p.width,'height':p.height,'lines':lines(kept),'excluded':''.join(c['text']for c in excluded).replace('\x00',' ')}
    # Text alone is sufficient for law/notice article spacing restoration.
    if doc['type']=='SOP':
     kept_ids={id(c)for c in kept};proxy=p.filter(lambda obj:obj.get('object_type')!='char' or id(obj)in kept_ids);proxy.annex_images=[im for im in p.images if .015*p.width*p.height<im['width']*im['height']<.85*p.width*p.height and im['width']>p.width*.1 and im['height']>p.height*.08];regions=[]
     for t in proxy.find_tables():
      if len(t.rows)<2 or len(t.columns)<2 or (t.bbox[2]-t.bbox[0])*(t.bbox[3]-t.bbox[1])<p.width*p.height*.018:continue
      block=source_table(proxy,t)
      if block:regions.append({'box':list(t.bbox),'kind':'table','block':block})
     info=previews['documents'][doc['id']]['pages'][str(n)]
     raw_index=index['pages'][n-1]['text'];page['divider']=info.get('kind')=='divider' or bool(divider_heading(raw_index,doc['title']))
     visual_boxes=[v['source_box']for v in info.get('visuals',[])] if info.get('mode')=='crop' else [[b[i]*(p.width if i%2==0 else p.height)for i in range(4)]for b in info.get('visual_bounds',[])]
     for box in visual_boxes:
      def overlap(b):return max(0,min(b[2],box[2])-max(b[0],box[0]))*max(0,min(b[3],box[3])-max(b[1],box[1]))
      if any(overlap(r['box'])>min((box[2]-box[0])*(box[3]-box[1]),(r['box'][2]-r['box'][0])*(r['box'][3]-r['box'][1]))*.5 for r in regions):continue
      # Keep mixed-page prose outside a complete diagram/table region. A
      # full-page image would consume the following section on the same page.
      full=False
      has_heading=any(h['page']==n and box[1]<=h['topRatio']*p.height<=box[3] for h in structure[doc['sha256']]['headings'])
      banners=[im for im in p.images if im['height']<p.height*.08 and centre(im,box) and any(h['page']==n and im['top']<=h['topRatio']*p.height<=im['bottom'] for h in structure[doc['sha256']]['headings'])]
      if has_heading and banners and box[3]-box[1]<p.height*.15 and not any(centre(im,box)for im in proxy.annex_images):continue
      bounds=[0,0,p.width,p.height]if full else box
      # Native heading banners and bullets are not substantive illustrations.
      inside=[c for c in kept if centre(c,bounds)]
      label=compact(text(inside))
      if not full and len(label)<80 and (box[3]-box[1])<p.height*.09 and (box[2]-box[0])<p.width*.35:continue
      asset={k:info[k]for k in ['path','width','height','bytes']}if full else None
      if not full:
       with Image.open(ROOT/'site'/info['path'])as im:
        pixel=pixel_box(bounds,render_box(p),im.width,im.height);sig=hashlib.sha256(json.dumps(pixel).encode()).hexdigest()[:12];dest=ROOT/'site/assets/pages'/doc['sha256']/f'reading-{n}-{sig}.webp'
        if not dest.exists():im.crop(tuple(pixel)).save(dest,'WEBP',quality=86,method=4)
        asset={'path':dest.relative_to(ROOT/'site').as_posix(),'width':pixel[2]-pixel[0],'height':pixel[3]-pixel[1],'bytes':dest.stat().st_size}
      regions.append({'box':bounds,'kind':'image','block':{'kind':'image','crop':asset,'fullPage':full}})
     # Produce text runs between source regions; every native text glyph is
     # either selectable prose/a table cell, or inside a retained source image.
     assigned=[]
     for r in sorted(regions,key=lambda r:r['box'][1]):
      r['block']['sourceBox']=r['box'];assigned.append(r)
     free=[c for c in kept if not any(centre(c,r['box'])for r in assigned)]
     blocks=[r['block']for r in assigned]
     # Each line retains its own coordinates so a section can start mid-page.
     if free:blocks.append({'kind':'text','lines':lines(free)})
     materialise_cells({'blocks':blocks},n,doc,p)
     shown=''.join('\n'.join(l['text']for l in b['lines']) if b['kind']=='text' else ''.join(c['text']for row in b['rows']for c in row) if b['kind']=='table' else ''.join(c['text']for c in kept if centre(c,b['sourceBox']))for b in blocks)
     if normalized(shown)!=normalized(''.join(c['text']for c in kept)):
      stats['ambiguous_pages']+=1
      blocks=[{'kind':'image','sourceBox':[0,0,p.width,p.height],'fullPage':True,'reason':'native-coverage','crop':{k:info[k]for k in ['path','width','height','bytes']}}]
     clean_margin_images(blocks,[r['box']for r in confirmed.get(str(n),[])if r['edge']in('top','bottom')],p,doc,info)
     page['blocks']=blocks
     page['retained_chars']=sum(normalized(''.join(c['text']for c in kept)).values());page['source_hash']=hashlib.sha256(''.join(c['text']for c in kept).encode()).hexdigest()
     stats['tables']+=sum(b['kind']=='table'for b in blocks);stats['images']+=sum(b['kind']=='image'for b in blocks)
    pages[str(n)]=page;stats['pages']+=1;p.close()
  output['documents'][doc['id']]={'source_sha256':doc['sha256'],'pages':pages};print(doc['title'],len(pages),'reading pages',flush=True)
 split=ROOT/'site/data/reading';split.mkdir(exist_ok=True)
 for doc in manifest['documents']:
  if doc['id']in output['documents']:(split/(doc['sha256']+'.json')).write_text(json.dumps(output['documents'][doc['id']],ensure_ascii=False,separators=(',',':')),encoding='utf8')
 dest=ROOT/'site/data/reading-pages.json';dest.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf8');print(dict(stats),'bytes',dest.stat().st_size,flush=True)
if __name__=='__main__':
 import sys
 build(sys.argv[1]if len(sys.argv)>1 else None)
