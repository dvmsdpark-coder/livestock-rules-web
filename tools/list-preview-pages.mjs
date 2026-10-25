import fs from 'node:fs';
import {actualAnnexes} from '../site/assets/annexes.js';
const m=JSON.parse(fs.readFileSync('site/data/manifest.json'));
console.log(JSON.stringify(m.documents.map(doc=>{const index=JSON.parse(fs.readFileSync('site/'+doc.data));return {doc,pages:[...new Set(actualAnnexes(index).flatMap(a=>Array.from({length:a.endPage-a.part.page+1},(_,i)=>a.part.page+i)))].sort((a,b)=>a-b)};})));
