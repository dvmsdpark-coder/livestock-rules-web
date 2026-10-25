"""Render immutable PDF annex pages for mobile viewing; never rewrite source PDFs."""
import hashlib,json,os,subprocess
from pathlib import Path
import pypdfium2 as pdf

ROOT=Path(__file__).resolve().parents[1]
def build():
    listing=json.loads(subprocess.check_output([os.environ.get('NODE_BINARY','node'),'tools/list-preview-pages.mjs'],cwd=ROOT))
    output={'schema':1,'documents':{}}
    count=total=0
    for entry in listing:
        doc=entry['doc'];source=ROOT/'site'/doc['pdf']
        if hashlib.sha256(source.read_bytes()).hexdigest()!=doc['sha256']:raise ValueError('PDF hash mismatch: '+doc['title'])
        pages={};document=pdf.PdfDocument(str(source))
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
            size=target.stat().st_size
            pages[str(number)]={'path':target.relative_to(ROOT/'site').as_posix(),'width':width,'height':height,'bytes':size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
            count+=1;total+=size;page.close()
        document.close()
        output['documents'][doc['id']]={'source_sha256':doc['sha256'],'pages':pages}
        print(doc['title'],len(pages),'pages',flush=True)
    target=ROOT/'site/data/page-previews.json';temporary=target.with_suffix('.pending')
    temporary.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf-8');os.replace(temporary,target)
    print(f'{count} pages; {total/1024/1024:.2f} MiB; average {total/max(1,count)/1024:.1f} KiB',flush=True)
if __name__=='__main__':build()
