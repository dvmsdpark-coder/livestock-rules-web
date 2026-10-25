"""Render immutable PDF annex pages for mobile viewing; never rewrite source PDFs."""
import hashlib,json,os,subprocess
from pathlib import Path
import pypdfium2 as pdf

ROOT=Path(__file__).resolve().parents[1]
def image_fingerprint(obj):
    return hashlib.sha256(bytes(obj.get_data())).hexdigest()

def background_images(document):
    # Only repeated full-page backgrounds and edge sidebars are decorations.
    # Unique full-page scans retain their pictures and are never discarded here.
    from collections import Counter
    fingerprints=Counter()
    for number in range(len(document)):
        page=document[number];width,height=page.get_width(),page.get_height()
        seen=set()
        for obj in page.get_objects(filter=[pdf.raw.FPDF_PAGEOBJ_IMAGE]):
            left,bottom,right,top=obj.get_bounds();w,h=abs(right-left),abs(top-bottom)
            if w*h>=width*height*.9 or (w<width*.16 and h>height*.7):
                seen.add(image_fingerprint(obj))
        fingerprints.update(seen);page.close()
    return {key for key,count in fingerprints.items() if count>=5}

def visual_content(page,decorations=frozenset()):
    image_area=0;paths=0;area=page.get_width()*page.get_height()
    for obj in page.get_objects():
        if obj.type==pdf.raw.FPDF_PAGEOBJ_PATH:paths+=1
        elif obj.type==pdf.raw.FPDF_PAGEOBJ_IMAGE:
            try:
                if image_fingerprint(obj) in decorations:continue
                left,bottom,right,top=obj.get_bounds()
                image_area+=abs((right-left)*(top-bottom))
            except (ValueError,RuntimeError):pass
    return image_area>=area*0.025 or paths>=20

def build():
    listing=json.loads(subprocess.check_output([os.environ.get('NODE_BINARY','node'),'tools/list-preview-pages.mjs'],cwd=ROOT))
    output={'schema':1,'documents':{}}
    count=total=0
    for entry in listing:
        doc=entry['doc'];source=ROOT/'site'/doc['pdf']
        if hashlib.sha256(source.read_bytes()).hexdigest()!=doc['sha256']:raise ValueError('PDF hash mismatch: '+doc['title'])
        pages={};document=pdf.PdfDocument(str(source))
        decorations=background_images(document) if doc['type']=='SOP' else set()
        dest=ROOT/'site/assets/pages'/doc['sha256'];dest.mkdir(parents=True,exist_ok=True)
        for number in entry['pages']:
            target=dest/f'{number}.webp'
            page=document[number-1]
            if not target.exists():
                bitmap=page.render(scale=1440/page.get_width())
                image=bitmap.to_pil().convert('RGB')
                image.save(target,'WEBP',quality=82,method=4)
                width,height=image.size
                image.close();bitmap.close()
            else:
                from PIL import Image
                with Image.open(target) as image:width,height=image.size
            visual=doc['type']=='SOP' and (number in entry.get('layoutPages',[]) or visual_content(page,decorations))
            size=target.stat().st_size
            pages[str(number)]={'path':target.relative_to(ROOT/'site').as_posix(),'width':width,'height':height,'bytes':size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'visual':visual}
            count+=1;total+=size;page.close()
        document.close()
        output['documents'][doc['id']]={'source_sha256':doc['sha256'],'pages':pages}
        print(doc['title'],len(pages),'pages',flush=True)
    target=ROOT/'site/data/page-previews.json';temporary=target.with_suffix('.pending')
    temporary.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf-8');os.replace(temporary,target)
    print(f'{count} pages; {total/1024/1024:.2f} MiB; average {total/max(1,count)/1024:.1f} KiB',flush=True)
if __name__=='__main__':build()
