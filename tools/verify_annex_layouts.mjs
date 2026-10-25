import fs from 'node:fs';import assert from 'node:assert/strict';
import {actualAnnexes} from '../site/assets/annexes.js';
import {annexLayouts,joinedAnnexLayouts} from '../site/assets/annex-presentation.js';
const m=JSON.parse(fs.readFileSync('site/data/manifest.json')),data=JSON.parse(fs.readFileSync('site/data/annex-layouts.json'));
const glyphs=s=>[...s.replace(/\s/gu,'')].sort().join('');
const text=pages=>pages.flatMap(p=>(p.blocks||[]).map(b=>b.kind==='text'?b.text:b.kind==='table'?b.rows.flat().map(c=>c.text).join(''):'' )).join('');
let annexes=0,tables=0,joinedTables=0;
for(const doc of m.documents.filter(d=>['법률','시행령','시행규칙'].includes(d.type))){const index=JSON.parse(fs.readFileSync('site/'+doc.data));for(const annex of actualAnnexes(index).filter(a=>a.kind==='table')){const source=annexLayouts(data,doc,annex);assert(source,'Missing source-bound annex');const joined=joinedAnnexLayouts(source);assert.equal(glyphs(text(source)),glyphs(text(joined)),'Changed characters: '+annex.heading);const original=source.flatMap(p=>(p.blocks||[]).filter(b=>b.kind==='table'));tables+=original.length;const rendered=joined.flatMap(p=>(p.blocks||[]).filter(b=>b.kind==='table'));joinedTables+=rendered.length;
for(const t of rendered){for(const row of t.rows){const subject=row.find(c=>c.col===0);if(!subject)continue;const markers=[...subject.text.matchAll(/(?:^|\n)(?:\d+|[가-힣])\)/gu)];const columns=row.filter(c=>/^[\d, .\n]+$/u.test(c.text)&&c.text.split('\n').filter(Boolean).length>1);assert(!(markers.length>=2&&columns.length>=2),'Unresolved detailed amount rows: '+annex.heading);}const slots=new Set();for(let row=0;row<t.rows.length;row++)for(const cell of t.rows[row])for(let y=row;y<row+cell.rowspan;y++)for(let x=cell.col;x<cell.col+cell.colspan;x++){const key=y+':'+x;assert(y<t.rows.length&&x<t.columns&&!slots.has(key),'Broken merged grid');slots.add(key);}assert.equal(slots.size,t.rows.length*t.columns);}
if(doc.type==='시행령'&&annex.number[0]==='1'&&annex.number[1]==='2'){assert.equal(rendered.length,1);assert.deepEqual(rendered[0].pages,[26,27,28]);assert.equal(rendered[0].rows.length,9);}
if(doc.type==='시행령'&&annex.number[0]==='3'){
 const rows=rendered.flatMap(t=>t.rows),amounts=row=>[2,3,4].map(col=>row.find(c=>c.col===col)?.text.replace(/\s/gu,'')||'');
 for(const [prefix,expected] of [['터.',[['100','400','1,000'],['100','400','800'],...Array.from({length:5},()=>['500','750','1,000'])]],['퍼.',[['50','200','300'],['50','100','200'],['100','150','200'],['100','150','200'],['50','100','200'],['50','100','200'],['50','150','300'],['50','100','200']]]]){
  const start=rows.findIndex(row=>row.some(c=>c.col===0&&c.text.startsWith(prefix)));assert(start>=0);assert.deepEqual(amounts(rows[start]),['','','']);assert.equal(rows[start].find(c=>c.col===1).rowspan,expected.length+1);
  for(let i=0;i<expected.length;i++){assert(rows[start+i+1].some(c=>c.col===0&&c.text.startsWith((i+1)+')')),prefix+' child '+(i+1));assert.deepEqual(amounts(rows[start+i+1]),expected[i],prefix+' amount '+(i+1));}
 }
 const clipped=rows.findIndex(row=>row.some(c=>c.col===0&&c.text.startsWith('처.')));assert(clipped>=0);assert.deepEqual(amounts(rows[clipped+1]),['50','200','1,000']);assert.deepEqual(amounts(rows[clipped+2]),['300','600','1,000']);
 const parent=rows.findIndex(row=>row.some(c=>c.col===0&&c.text.startsWith('고.')));assert(parent>=0);const children=rows.slice(parent+1,parent+5);const ga=children.find(row=>row.some(c=>c.col===0&&c.text.startsWith('가)'))),na=children.find(row=>row.some(c=>c.col===0&&c.text.startsWith('나)')));assert(ga&&na);assert.deepEqual(amounts(ga),['50','150','300']);assert.deepEqual(amounts(na),['100','200','300']);
}
annexes++;}}
console.log(`PASS ${annexes} annexes: ${tables} source tables → ${joinedTables} screen tables; all characters and merged cells preserved`);
