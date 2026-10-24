import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {corpus,defaults} from '../tools/evaluate.mjs';
import {search} from '../site/assets/search.js';import {presentResults} from '../site/assets/evidence.js';
import {actualAnnexes} from '../site/assets/annexes.js';import {annexExcerpt} from '../site/assets/annex-excerpts.js';
const decree=corpus.find(e=>e.doc.type==='시행령'),table=actualAnnexes(decree.index).find(a=>a.kind==='table'&&a.number[0]==='2'&&!a.number[1]);
for(const q of ['구제역 백신 미접종 시 보상금은 어떻게 되죠?','구제역 백신 접종 안했을 때 보상금','예방접종 명령 위반 보상금','구제역 백신 안 맞으면 보상금'])test('vaccination compensation reaches source chain and exact annex unit: '+q,()=>{
 const r=search(corpus,q,defaults),groups=presentResults(corpus,r,q).groups;
 assert.equal(groups[0].docType,'법률');assert.equal(groups[0].articleNumber,'제48조');assert(groups[0].primary);
 assert(groups[0].focus.some(u=>u.paragraph===3&&u.item===2));assert(groups[0].focus.some(u=>u.paragraph===4));
 assert(groups.some(g=>g.docType==='시행령'&&g.articleNumber==='제11조'&&g.primary));
 const excerpt=groups.find(g=>g.docType==='시행령'&&g.kind==='table')?.annexExcerpt;assert(excerpt);
 assert.deepEqual(excerpt.selected.map(u=>u.key),['2:카']);assert.deepEqual(excerpt.selected[0].parts.map(p=>p.page),[32,33]);
 assert(excerpt.selected[0].images.length===2);assert(excerpt.selected[0].intro.map(p=>p.text).join('').includes('제48조제3항'));
 assert.deepEqual(excerpt.common.map(u=>u.key),['4','5']);assert(excerpt.common[0].parts.map(p=>p.text).join('').includes('적은 경우'));
 assert(excerpt.adjustment.some(u=>u.root===3));assert(groups.filter(g=>g.docType==='SOP').every(g=>!g.primary));
});
test('annex excerpts preserve exact spans and text; original crops remain available',()=>{
 const e=annexExcerpt(decree,table,'구제역 백신 미접종 보상금');
 for(const u of [...e.selected,...e.common,...e.adjustment,...e.choices])for(const p of [...u.intro,...u.parts]){
  assert(decree.index.pages.find(page=>page.page===p.page).text.includes(p.text));
  assert.equal(p.display.replace(/\s/gu,''),p.text.replace(/\s/gu,''));
 }
 for(const image of [...e.selected,...e.common].flatMap(u=>u.images||[])){
  const bytes=fs.readFileSync(new URL('../site/'+image.path,import.meta.url));assert.equal(bytes.toString('ascii',1,4),'PNG');assert.equal(bytes.readUInt32BE(16),1040);assert(bytes.readUInt32BE(20)>0);
 }
});
test('an unqualified annex query exposes a source selector without guessing a clause',()=>{
 const e=annexExcerpt(decree,table,'시행령 별표 2');assert(e);assert.deepEqual(e.selected,[]);assert(e.choices.length>20);assert(e.choices.some(u=>u.key==='2:카'&&u.images.length===2));
});
test('financial source expansion respects type and date and rejects unrelated qualifiers',()=>{
 const q='구제역 백신 미접종 보상금';
 const law=search(corpus,q,{...defaults,type:'법률'});assert(law.results.some(r=>r.heading.startsWith('제48조(')));assert(law.results.every(r=>r.docType==='법률'));
 for(const type of ['시행령','고시','SOP'])assert(search(corpus,q,{...defaults,type}).results.every(r=>r.docType===type));
 assert.equal(search(corpus,q,{...defaults,asOf:'2020-01-01'}).results.length,0);
 assert.equal(search(corpus,'보상금 검역증명서',defaults).results.length,0);
});
