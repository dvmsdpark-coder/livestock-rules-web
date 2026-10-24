import test from 'node:test';import assert from 'node:assert/strict';
import {corpus,defaults} from '../tools/evaluate.mjs';import {search} from '../site/assets/search.js';import {presentResults} from '../site/assets/evidence.js';
const run=(q,filters={})=>{const r=search(corpus,q,{...defaults,...filters});return {r,groups:presentResults(corpus,r,q).groups};};
for(const q of ['법정전염병의 종류','법정전염병 종류 알려주세요','법정 전염병 목록','법정가축전염병의 종류','가축전염병의 분류','가축전염병은 어떻게 분류되나요?'])test('classification names the subject and excludes unrelated clauses: '+q,()=>{
 const {r,groups}=run(q);assert.equal(r.mode,'classification');assert.equal(r.diagnostics.subject,'가축전염병');assert.equal(groups.length,2);
 assert.deepEqual(groups.map(g=>[g.docType,g.articleNumber]),[['법률','제2조'],['시행규칙','제2조']]);
 const law=groups[0],rule=groups[1];assert.deepEqual(law.focus.slice(1).map(u=>u.label),['제1종 가축전염병','제2종 가축전염병','제3종 가축전염병']);
 const content=law.focus.map(u=>u.parts.map(p=>p.text).join('')).join('');assert(content.includes('구제역'));assert(content.includes('탄저'));assert(content.includes('소유행열'));
 assert(rule.focus.some(u=>u.paragraph===1&&u.parts.map(p=>p.text).join('').includes('타이레리아')));assert(rule.focus.some(u=>u.paragraph===2&&u.parts.map(p=>p.text).join('').includes('소전염성비기관염')));
 for(const g of groups){const text=g.focus.flatMap(u=>u.parts).map(p=>p.text).join('');assert(!/보상금|생계안정|소득안정|신고대상|물렁진드기/u.test(text));}
});
for(const grade of [1,2,3])test('grade-specific classification only previews that grade: '+grade,()=>{
 const {groups}=run('제'+grade+'종 가축전염병 종류');assert(groups.length);
 assert.deepEqual(groups[0].focus.slice(1).map(u=>u.label),['제'+grade+'종 가축전염병']);
 if(grade===1)assert.equal(groups.length,1);else{assert.equal(groups.length,2);assert.equal(groups[1].focus.length,1);assert.equal(groups[1].focus[0].paragraph,grade-1);}
});
test('classification spans preserve source content and citation offsets',()=>{
 for(const g of run('법정전염병의 종류').groups)for(const u of g.focus)for(const p of u.parts){
  assert(corpus.find(e=>e.doc.id===g.documentId).index.pages.find(page=>page.page===p.page).text.includes(p.text));
  assert.equal(p.display.replace(/\s/gu,''),p.text.replace(/\s/gu,''));for(const ref of p.references)assert.equal(p.display.slice(ref.start,ref.end),ref.label);
 }
});
for(const q of ['종류','종류를 알려주세요','분류','목록','유형','구분','항목','우주전염병의 종류','법정감염병의 종류','사람 법정전염병 종류','규정의 종류','면역요법 종류'])test('generic list words and unverified subjects cannot produce unrelated answers: '+q,()=>{
 assert.equal(run(q).r.results.length,0);
});
test('formal classification respects filters and source date',()=>{
 assert(run('법정전염병의 종류',{type:'법률'}).groups.every(g=>g.docType==='법률'));
 const rule=run('법정전염병의 종류',{type:'시행규칙'});assert.equal(rule.groups.length,1);assert.equal(rule.groups[0].articleNumber,'제2조');
 assert.equal(run('법정전염병의 종류',{type:'SOP'}).r.results.length,0);assert.equal(run('법정전염병의 종류',{asOf:'2020-01-01'}).r.results.length,0);
});

test('several requested grades are retained, unsupported grades are not replaced',()=>{
 const {groups}=run('제1종과 제2종 법정전염병 목록');
 assert.deepEqual(groups[0].focus.slice(1).map(u=>u.label),['제1종 가축전염병','제2종 가축전염병']);assert.deepEqual(groups[1].focus.map(u=>u.paragraph),[1]);
 for(const q of ['제4종 가축전염병 종류','제4종 가축전염병','제0종 법정전염병 종류'])assert.equal(run(q).r.results.length,0);
});

test('an exact article title about measures is not mistaken for a disease list',()=>{
 for(const [q,number] of [['제2종 가축전염병에 대한 조치','제28조'],['제3종 가축전염병에 대한 조치','제28조의2']]){
  const {r,groups}=run(q);assert.equal(r.mode,'article');assert(groups.some(g=>g.docType==='법률'&&g.articleNumber===number));
 }
});

test('other explicit definition lists keep their own subject',()=>{
 for(const [q,item,term] of [['가축의 종류',1,'말, 당나귀'],['특정위험물질 종류',6,'편도']]){
  const {groups}=run(q);assert(groups.length);assert.equal(groups[0].docType,'법률');assert.equal(groups[0].target.item,item);
  assert(groups[0].focus.flatMap(u=>u.parts).map(p=>p.text).join('').includes(term));
 }
});
