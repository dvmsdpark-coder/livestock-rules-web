import fs from 'node:fs';
import {actualAnnexes} from '../site/assets/annexes.js';
const m=JSON.parse(fs.readFileSync('site/data/manifest.json'));
console.log(JSON.stringify(m.documents.map(doc=>({doc,annexes:actualAnnexes(JSON.parse(fs.readFileSync('site/'+doc.data))).filter(a=>a.kind==='table')}))));
