import test from 'node:test';import assert from 'node:assert/strict';
import {search} from '../site/assets/search.js';import {presentResults} from '../site/assets/evidence.js';
import {corpus,defaults,evaluate} from '../tools/evaluate.mjs';
test('independent natural-language fixtures reach their expected source in the first six legal groups',()=>{
 const r=evaluate();assert(r.natural.total>=33);assert.deepEqual(r.natural.cases.filter(c=>!c.hitInSix),[]);assert.deepEqual(r.structural.failed,[]);assert(r.structural.total>600);
});
test('ranked excerpts and parent introductions remain exact page substrings, with correct link offsets',()=>{
 for(const q of ['살처분 보상금은 어떻게 받나요?','축산차량은 어디에 등록하나요?','HPAI 재입식 조건','ASF 발생농장 분뇨 처리','방문기록 보관 기간']){
  const result=search(corpus,q,defaults);assert.equal(result.mode,'ranked');const view=presentResults(corpus,result,q);
  for(const g of view.groups)for(const u of g.focus)for(const p of u.parts){
   const page=corpus.find(e=>e.doc.id===g.documentId).index.pages.find(page=>page.page===p.page);
   assert(page.text.includes(p.text),q+' '+u.label);
   for(const ref of p.references||[])assert.equal((p.display||p.text).slice(ref.start,ref.end),ref.label);
  }
 }
});
test('derived vocabulary does not create cross-word anchors such as 장소 in 농장 소독약',()=>{
 const r=search(corpus,'구제역 농장 소독약은 몇 배 희석하나요?',defaults);assert(!r.diagnostics.terms.includes('장소'));
 assert.equal(r.diagnostics.status,'needs_detail');assert(!presentResults(corpus,r,'구제역 농장 소독약은 몇 배 희석하나요?').groups.some(g=>g.primary));assert(r.message.includes('희석배율'));
 const compensation=search(corpus,'보상금 지급을 거부할 수 있나요?',defaults);assert(!compensation.diagnostics.terms.includes('금지'));
});
test('unknown vocabulary and no eligible documents have distinct diagnostics',()=>{
 const unknown=search(corpus,'외계인 우주선 규정',defaults);assert.equal(unknown.diagnostics.status,'no_terms');assert.equal(unknown.results.length,0);
 const old=search(corpus,'분뇨 처리',{...defaults,asOf:'2000-01-01'});assert.equal(old.diagnostics.status,'no_documents');assert.equal(old.results.length,0);
 const absent=search(corpus,'보상금 검역증명서',{...defaults});assert.equal(absent.diagnostics.status,'no_match');assert.equal(absent.results.length,0);
});
test('disease, document-type and reference-date restrictions apply to general retrieval',()=>{
 for(const disease of ['구제역','ASF','고병원성AI'])for(const type of ['고시','SOP','시행규칙']){
  const r=search(corpus,'재입식 조건',{...defaults,disease,type});assert(r.results.every(p=>p.docType===type&&(p.disease===disease||p.disease==='공통')));
 }
 const r=search(corpus,'가축의 소유자',{...defaults,asOf:'2026-10-24',type:'법률'});
 assert(r.results.every(p=>p.from<='2026-10-24'));
});
test('generic retrieval does not replace structured definitions, exact article or multi-disease checks',()=>{
 assert.equal(search(corpus,'가축의 정의',defaults).mode,'definition');
 assert.equal(search(corpus,'가축전염병 예방법 제11조제1항',defaults).mode,'article');
 assert.equal(search(corpus,'존재하지않는용어의 정의',defaults).results.length,0);
 assert.equal(search(corpus,'ASF와 구제역 재입식 조건',defaults).results.length,0);
 assert.equal(search(corpus,'ASF 재입식 조건',{...defaults,disease:'구제역'}).results.length,0);
});
test('document-specific application conditions survive ranked extraction',()=>{
 const r=search(corpus,'ASF 발생농장 분뇨 처리',defaults),v=presentResults(corpus,r,'ASF 발생농장 분뇨 처리');
 const text=v.groups.filter(g=>g.primary).flatMap(g=>g.focus.flatMap(u=>u.parts)).map(p=>p.text).join('');
 assert(text.includes('발생농장'));assert(/분뇨/u.test(text));assert(/다만|소독/u.test(text));
});
