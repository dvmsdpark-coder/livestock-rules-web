"""Check generated mobile assets against exact source versions and selected pages."""
import hashlib,json,os,subprocess
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
listing=json.loads(subprocess.check_output([os.environ.get('NODE_BINARY','node'),'tools/list-preview-pages.mjs'],cwd=ROOT))
data=json.loads((ROOT/'site/data/page-previews.json').read_text(encoding='utf-8'))
count=0
for entry in listing:
    doc=entry['doc'];preview=data['documents'][doc['id']]
    assert preview['source_sha256']==doc['sha256']
    assert set(preview['pages'])==set(map(str,entry['pages']))
    for number,p in preview['pages'].items():
        file=(ROOT/'site'/p['path']).resolve()
        assert file.is_relative_to((ROOT/'site/assets/pages'/doc['sha256']).resolve())
        assert file.stat().st_size==p['bytes']
        assert hashlib.sha256(file.read_bytes()).hexdigest()==p['sha256']
        with Image.open(file) as image:
            assert image.format=='WEBP' and image.size==(p['width'],p['height']) and image.width==1440
            image.verify()
        count+=1
print('PASS',count,'source-bound mobile page images')
