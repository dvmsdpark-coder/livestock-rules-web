"""Check generated mobile assets against exact source versions and selected pages."""
import hashlib,json,os,subprocess
from pathlib import Path
from PIL import Image
from page_furniture import compact,NUMBER
from pdf_geometry import pixel_box
ROOT=Path(__file__).resolve().parents[1]
listing=json.loads(subprocess.check_output([os.environ.get('NODE_BINARY','node'),'tools/list-preview-pages.mjs'],cwd=ROOT))
data=json.loads((ROOT/'site/data/page-previews.json').read_text(encoding='utf-8'))
count=0
for entry in listing:
    doc=entry['doc'];preview=data['documents'][doc['id']];index=json.loads((ROOT/'site'/doc['data']).read_text(encoding='utf-8'))
    assert preview['source_sha256']==doc['sha256']
    if doc['type']=='SOP':assert len(preview['pages'])==doc['pages']
    assert set(preview['pages'])==set(map(str,entry['pages']))
    for number,p in preview['pages'].items():
        assert isinstance(p.get('visual'),bool)
        for item in p.get('furniture',[]):
            assert doc['type']=='SOP' and NUMBER.fullmatch(item['text'])
            assert item['edge'] in ('top','bottom','left','right') and item['source_edge'] in ('start','end')
            lines=[line for line in index['pages'][int(number)-1]['text'].splitlines() if line.strip()]
            start=item['source_edge']=='start';assert compact(lines[0] if start else lines[-1])==compact(item['text'])
            context=compact(''.join(lines[1:] if start else lines[:-1]));assert item['context']==(context[:32] if start else context[-32:])

        file=(ROOT/'site'/p['path']).resolve()
        assert file.is_relative_to((ROOT/'site/assets/pages'/doc['sha256']).resolve())
        assert file.stat().st_size==p['bytes']
        assert hashlib.sha256(file.read_bytes()).hexdigest()==p['sha256']
        with Image.open(file) as image:
            assert image.format=='WEBP' and image.size==(p['width'],p['height']) and image.width==1440
            image.verify()
        if p['visual'] and p.get('mode')=='crop':assert p.get('visuals')
        assert len({c['path'] for c in p.get('visuals',[])})==len(p.get('visuals',[]))
        for crop in p.get('visuals',[]):
            c=(ROOT/'site'/crop['path']).resolve();assert c.is_relative_to(file.parent)
            x0,y0,x1,y1=crop['pixel_box'];assert 0<=x0<x1<=p['width'] and 0<=y0<y1<=p['height']
            assert crop['pixel_box']==pixel_box(crop['source_box'],p['render_box'],p['width'],p['height'])
            assert crop['width']==x1-x0 and crop['height']==y1-y0
            assert c.stat().st_size==crop['bytes'] and hashlib.sha256(c.read_bytes()).hexdigest()==crop['sha256']
            with Image.open(c) as image:assert image.size==(crop['width'],crop['height']);image.verify()
        if p.get('mode')=='full' and p['visual']:assert p.get('continuation')
        count+=1
# Source-bound visual regressions: a real body organisation chart must be visible,
# while the HPAI page background must not turn a plain-text page into a diagram.
for e in listing:
    d=e['doc'];pages=data['documents'][d['id']]['pages']
    if d['sha256']=='f317fe10748e2a09e84db8098071ee71a0d9609490a35428479e6caccb8f3e60':
        assert pages['45']['visual'] and pages['45']['mode']=='crop'
        assert not pages['21']['visual'] and not pages['140']['visual']
        assert pages['320']['visual'] # notice illustration, not a chapter divider
    if d['sha256']=='8ca92a9774fa4ca4af353140f4fed9741297780d189aeadd5ac72e26153fec4a':
        assert pages['13']['mode']=='full' and pages['14']['mode']=='full'
        assert pages['84']['mode']=='crop' and pages['85']['mode']=='crop'
    if d['sha256']=='a2b814c1053b54f9e772628e60f5dee7abe2e841b3ae69efedc026a6d5a9995d':
        assert not pages['30']['visual']
        assert any(f['text']=='210' and f['edge']=='bottom' for f in pages['217']['furniture'])
print('PASS',count,'source-bound mobile page images')
