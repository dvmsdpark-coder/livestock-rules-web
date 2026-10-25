import fs from 'node:fs';
import {actualAnnexes} from '../site/assets/annexes.js';
const m=JSON.parse(fs.readFileSync('site/data/manifest.json'));
console.log(JSON.stringify(m.documents.map(doc=>{const index=JSON.parse(fs.readFileSync('site/'+doc.data));return {doc,layoutPages:[...new Set(index.chunks.filter(c=>['figure','table','form'].includes(c.kind)).map(c=>c.page))],pages:doc.type==='SOP'?index.pages.map(p=>p.page):[...new Set(actualAnnexes(index).flatMap(a=>Array.from({length:a.endPage-a.part.page+1},(_,i)=>a.part.page+i)))].sort((a,b)=>a-b)};})));
