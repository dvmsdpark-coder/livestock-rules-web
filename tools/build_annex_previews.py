"""Render reviewed source crops; never modify the original regulation PDF."""
import hashlib
import json
from pathlib import Path
import pypdfium2 as pdf

ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'site/data/manifest.json').read_text(encoding='utf-8'))
doc=next(d for d in manifest['documents'] if d['type']=='시행령')
assert doc['sha256']=='728b40d149eb8ea1402518923138e1a83853598ecf333182c65ba5a1bd7097a5', 'Review crop boundaries for the new revision'
source=ROOT/'site'/doc['pdf']
assert hashlib.sha256(source.read_bytes()).hexdigest()==doc['sha256']
# Reviewed against PDF 32-33 and 35-36, including the continuation and common
# minimum-payment clauses. Coordinates are PDF points, top-left origin.
crops=[('decree2-2-ka-32',32,709,812),('decree2-2-ka-33',33,56,138),
       ('decree2-4-35',35,729,791),('decree2-5-35',35,791,815),('decree2-5-36',36,56,100)]
document=pdf.PdfDocument(str(source));dest=ROOT/'site/assets/annex';dest.mkdir(exist_ok=True)
for name,page,top,bottom in crops:
    image=document[page-1].render(scale=2).to_pil()
    image.crop((80,top*2,1120,bottom*2)).save(dest/(name+'.png'))
print('Rendered',len(crops),'source crops')
