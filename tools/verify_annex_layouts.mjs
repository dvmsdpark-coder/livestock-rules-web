import fs from 'node:fs';import assert from 'node:assert/strict';
import {actualAnnexes} from '../site/assets/annexes.js';
import {annexLayouts,joinedAnnexLayouts} from '../site/assets/annex-presentation.js';
const m=JSON.parse(fs.readFileSync('site/data/manifest.json')),data=JSON.parse(fs.readFileSync('site/data/annex-layouts.json'));
const glyphs=s=>[...s.replace(/\s/gu,'')].sort().join('');
const text=pages=>pages.flatMap(p=>(p.blocks||[]).map(b=>b.kind==='text'?b.text:b.kind==='table'?b.rows.flat().map(c=>c.text).join(''):'' )).join('');
let annexes=0,tables=0,joinedTables=0;
for(const doc of m.documents.filter(d=>['법률','시행령','시행규칙'].includes(d.type))){const index=JSON.parse(fs.readFileSync('site/'+doc.data));for(const annex of actualAnnexes(index).filter(a=>a.kind==='table')){const source=annexLayouts(data,doc,annex);assert(source,'Missing source-bound annex');const joined=joinedAnnexLayouts(source);assert.equal(glyphs(text(source)),glyphs(text(joined)),'Changed characters: '+annex.heading);const original=source.flatMap(p=>(p.blocks||[]).filter(b=>b.kind==='table'));tables+=original.length;const rendered=joined.flatMap(p=>(p.blocks||[]).filter(b=>b.kind==='table'));joinedTables+=rendered.length;
for(const t of rendered){const slots=new Set();for(let row=0;row<t.rows.length;row++)for(const cell of t.rows[row])for(let y=row;y<row+cell.rowspan;y++)for(let x=cell.col;x<cell.col+cell.colspan;x++){const key=y+':'+x;assert(y<t.rows.length&&x<t.columns&&!slots.has(key),'Broken merged grid');slots.add(key);}assert.equal(slots.size,t.rows.length*t.columns);}
if(doc.type==='시행령'&&annex.number[0]==='1'&&annex.number[1]==='2'){assert.equal(rendered.length,1);assert.deepEqual(rendered[0].pages,[26,27,28]);assert.equal(rendered[0].rows.length,9);}
annexes++;}}
console.log(`PASS ${annexes} annexes: ${tables} source tables → ${joinedTables} screen tables; all characters and merged cells preserved`);
