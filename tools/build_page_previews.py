"""Render immutable PDF annex pages for mobile viewing; never rewrite source PDFs."""
import hashlib,json,os,subprocess
from pathlib import Path
import pypdfium2 as pdf
from sop_visuals import analyse

ROOT=Path(__file__).resolve().parents[1]
def build():
    listing=json.loads(subprocess.check_output([os.environ.get('NODE_BINARY','node'),'tools/list-preview-pages.mjs'],cwd=ROOT))
    output={'schema':1,'documents':{}}
    count=total=0
    for entry in listing:
        doc=entry['doc'];source=ROOT/'site'/doc['pdf']
        if hashlib.sha256(source.read_bytes()).hexdigest()!=doc['sha256']:raise ValueError('PDF hash mismatch: '+doc['title'])
        pages={};document=pdf.PdfDocument(str(source))
        analysis={}
        if doc['type']=='SOP':
            overrides=json.loads((ROOT/'maintenance/visual-overrides.json').read_text(encoding='utf-8')).get(doc['sha256'],{})
            analysis=analyse(source,json.loads((ROOT/'site'/doc['data']).read_text(encoding='utf-8')),overrides)
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
            info=analysis.get(str(number),{})
            visual=bool(info.get('regions'))
            crops=[];seen_pixels=set()
            if visual and info['mode']=='crop':
                from PIL import Image
                with Image.open(target) as full:
                    for region in info['regions']:
                        pixel=[max(0,int(region[0]/info['page_width']*width)),max(0,int(region[1]/info['page_height']*height)),min(width,int(region[2]/info['page_width']*width+.999)),min(height,int(region[3]/info['page_height']*height+.999))]
                        if pixel[0]>=pixel[2] or pixel[1]>=pixel[3]:raise ValueError('Empty visual crop')
                        if tuple(pixel) in seen_pixels:continue
                        seen_pixels.add(tuple(pixel))
                        signature=hashlib.sha256(json.dumps(pixel).encode()).hexdigest()[:12]
                        crop_path=dest/f'crop-{number}-{signature}.webp'
                        if not crop_path.exists():full.crop(tuple(pixel)).save(crop_path,'WEBP',quality=86,method=4)
                        crops.append({'path':crop_path.relative_to(ROOT/'site').as_posix(),'width':pixel[2]-pixel[0],'height':pixel[3]-pixel[1],'bytes':crop_path.stat().st_size,'sha256':hashlib.sha256(crop_path.read_bytes()).hexdigest(),'pixel_box':pixel})
            size=target.stat().st_size
            pages[str(number)]={'path':target.relative_to(ROOT/'site').as_posix(),'width':width,'height':height,'bytes':size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'visual':visual,'kind':info.get('kind','page'),'mode':info.get('mode','full'),'visuals':crops,'furniture':info.get('furniture',[])}
            count+=1;total+=size;page.close()
        document.close()
        # Consecutive full-page table/diagram pages are one source group.
        run=[]
        def finish_run():
            if run:
                for n in run:pages[str(n)]['continuation']=list(run)
                run.clear()
        for n in entry['pages']:
            info=pages[str(n)]
            if info['visual'] and info['mode']=='full':
                if run and n!=run[-1]+1:finish_run()
                run.append(n)
            else:finish_run()
        finish_run()
        output['documents'][doc['id']]={'source_sha256':doc['sha256'],'pages':pages}
        print(doc['title'],len(pages),'pages',flush=True)
    target=ROOT/'site/data/page-previews.json';temporary=target.with_suffix('.pending')
    temporary.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf-8');os.replace(temporary,target)
    print(f'{count} pages; {total/1024/1024:.2f} MiB; average {total/max(1,count)/1024:.1f} KiB',flush=True)
if __name__=='__main__':build()
