import test from 'node:test';
import assert from 'node:assert/strict';
import {corpus,defaults} from '../tools/evaluate.mjs';
import {search} from '../site/assets/search.js';
import {presentResults,articleDetail} from '../site/assets/evidence.js';
import {actualAnnexes,annexReferences} from '../site/assets/annexes.js';
const decree=corpus.find(e=>e.doc.type==='시행령');
const income=corpus.find(e=>e.doc.family==='income-support-notice');
const compensation=corpus.find(e=>e.doc.family==='compensation-notice');
test('supplied notice revisions and substantive appendices are registered',()=>{
 assert.equal(income.doc.from,'2026-10-01');assert.equal(income.doc.pages,11);assert.equal(income.index.articles.length,8);
 assert.equal(compensation.doc.from,'2026-06-02');assert.equal(compensation.doc.pages,41);assert.equal(compensation.index.articles.length,17);
 assert.deepEqual(actualAnnexes(income.index).map(a=>[a.kind,a.number,a.part.page,a.endPage]),[
  ['table',['1',null],5,9],['form',['1',null],10,10],['form',['2',null],11,11]]);
 assert.equal(actualAnnexes(compensation.index).length,10);assert(!compensation.doc.search_note);
 assert.deepEqual(actualAnnexes(compensation.index).map(a=>[a.part.page,a.endPage]),[[11,23],[24,24],[25,27],[28,31],[32,32],[33,33],[34,35],[36,37],[38,39],[40,41]]);
});
test('decree appendix list is never a table destination',()=>{
 const r=search(corpus,'시행령 별표 2',defaults);assert.equal(r.results.length,1);
 assert.equal(r.results[0].page,29);assert.equal(r.results[0].endPage,36);
 assert.equal(presentResults(corpus,r,'시행령 별표 2').groups[0].articleNumber,null);
});
for(const q of ['살처분보상금 감액','살처분 보상금 지급 기준','보상금 지급을 거부할 수 있나요?'])test('compensation criteria chain: '+q,()=>{
 const r=search(corpus,q,defaults),v=presentResults(corpus,r,q);
 const a=v.groups.find(g=>g.docType==='시행령'&&g.articleNumber==='제11조');
 assert(a?.primary);assert.deepEqual(a.focus.map(u=>u.paragraph),[1]);
 assert(a.focus.flatMap(u=>u.parts).some(p=>p.references.some(r=>r.kind==='annex'&&r.page===29)));
 assert(v.groups.some(g=>g.kind==='table'&&g.page===29&&g.endPage===36&&g.primary));
 assert(!v.groups.some(g=>g.kind==='table'&&g.page===22));
});
test('annex citations preserve owner, exact subnumber and original offsets',()=>{
 for(const [text,source,page] of [
  ['별표 2',decree.doc,29],['영 별표 2',income.doc,29],
  ['「가축전염병 예방법 시행령」 별표 1의2',income.doc,26],
  ['별지 제1호서식',income.doc,10],['별표 1',income.doc,5]]){
  const refs=annexReferences(text,source,corpus);assert.equal(refs.length,1,text);assert.equal(refs[0].page,page);assert.equal(text.slice(refs[0].start,refs[0].end),refs[0].label);
 }
 assert.equal(annexReferences('별표 2',compensation.doc,corpus)[0].page,25);
 assert.equal(annexReferences('별지 제3호의1서식',compensation.doc,corpus)[0].page,36);
 const detailNotice=articleDetail(corpus,{documentId:compensation.doc.id,articleNumber:'제4조',asOf:defaults.asOf});
 assert(detailNotice.parts.some(p=>p.references.some(r=>r.kind==='annex'&&r.page===11)));
 assert.deepEqual(annexReferences('「미등록 법률」 별표 2',decree.doc,corpus),[]);
 assert.deepEqual(annexReferences('같은 법 별표 2',decree.doc,corpus),[]);
 assert.deepEqual(annexReferences('별표 999',decree.doc,corpus),[]);
 const detail=articleDetail(corpus,{documentId:decree.doc.id,articleNumber:'제11조',asOf:defaults.asOf});
 assert(detail.parts.some(p=>p.references.some(r=>r.kind==='annex'&&r.page===29)));
});
test('support notice table follows the retrieved criteria; filters remain binding',()=>{
 const q='소득안정자금 지급 근거',r=search(corpus,q,defaults);
 assert(r.results.some(r=>r.documentId===income.doc.id&&r.kind==='table'&&r.page===5));
 assert(search(corpus,q,{...defaults,asOf:'2026-09-30'}).results.every(r=>r.documentId!==income.doc.id));
 assert(search(corpus,'살처분보상금 감액',{...defaults,type:'SOP'}).results.every(r=>r.docType==='SOP'));
});

test('compensation notice appendix searches keep their owner and exact subnumber',()=>{
 for(const [suffix,page,end] of [['별표 1',11,23],['별표 1의2',24,24],['별표 2',25,27],['별표 3',28,31],['별지 제3호서식',34,35],['별지 제3호의1서식',36,37]]){
  const r=search(corpus,compensation.doc.title+' '+suffix,defaults);
  assert.equal(r.results.length,1,suffix);assert.equal(r.results[0].documentId,compensation.doc.id);assert.equal(r.results[0].page,page);assert.equal(r.results[0].endPage,end);
 }
});
