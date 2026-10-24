import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {corpus,defaults} from '../tools/evaluate.mjs';
import {search} from '../site/assets/search.js';import {presentResults} from '../site/assets/evidence.js';import {sopIndex} from '../site/assets/sop-index.js';
const cases=JSON.parse(fs.readFileSync(new URL('./fixtures/sop-questions.json',import.meta.url)));
for(const f of cases)test('SOP scenario: '+f.id,()=>{
 const result=search(corpus,f.question,{...defaults,type:'SOP'}),view=presentResults(corpus,result,f.question);
 assert(result.results.every(r=>r.docType==='SOP'&&r.disease===f.disease));
 const g=view.groups.find(g=>g.heading===f.heading&&g.parts.some(p=>p.page===f.page));
 assert(g,'missing '+f.heading+' at PDF '+f.page);assert(g.primary);assert(g.focus.length);
});
test('wild-bird confirmed detection keeps its basic conditions and 21-day rule',()=>{
 const q=cases[0].question,r=search(corpus,q,{...defaults,type:'SOP'}),v=presentResults(corpus,r,q),g=v.groups.find(g=>g.heading===cases[0].heading);
 const t=g.focus.flatMap(u=>u.parts).map(p=>p.text).join('');assert(t.includes('21일간'));assert(t.includes('시료채취일'));assert(t.includes('특별방역대책기간'));
 assert(g.fullParts.some(p=>p.page===79));assert(!g.fullParts.some(p=>p.page===80));
});
test('SOP indexing preserves physical-page substrings and separates appended reference laws',()=>{
 for(const entry of corpus.filter(e=>e.doc.type==='SOP')){
  const sections=sopIndex(entry).sections;assert(sections.length>20,entry.doc.title);
  for(const section of sections)for(const p of [...section.parts,...section.units.flatMap(u=>u.parts)]){
   assert(entry.index.pages.find(page=>page.page===p.page).text.includes(p.text));
   if(entry.doc.disease==='ASF')assert(p.page<205);
   if(entry.doc.disease==='구제역')assert(p.page<287);
  }
 }
});
test('sample collection retains two distinct FMD vaccination scenarios and next-page continuation',()=>{
 const q='구제역 시료채취 송부',r=search(corpus,q,{...defaults,type:'SOP'}),v=presentResults(corpus,r,q);
 const g=v.groups.filter(g=>g.heading==='3 시료채취, 송부 및 진단 요령');assert.equal(g.length,2);
 assert.notEqual(g[0].scenario,g[1].scenario);assert(g.some(g=>g.fullParts.some(p=>p.page===82)));assert(g.some(g=>g.fullParts.some(p=>p.page===172)));
});
test('blank pages, tables and missing SOP topics do not become authoritative prose',()=>{
 const r=search(corpus,'야생조류에서 고병원성AI 검출시 어떤 방역조치?',{...defaults,type:'SOP'}),v=presentResults(corpus,r,'야생조류');
 assert(!v.groups.some(g=>g.primary&&g.kind==='table'));
 const none=search(corpus,'외계인 우주선',{...defaults,type:'SOP'});assert.equal(none.results.length,0);
 const conflict=search(corpus,'야생조류 고병원성AI 검출',{...defaults,type:'SOP',disease:'ASF'});assert.equal(conflict.results.length,0);
});
