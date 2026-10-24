import test from 'node:test';import assert from 'node:assert/strict';
import {corpus,defaults} from '../tools/evaluate.mjs';
import {search} from '../site/assets/search.js';
import {presentResults,articleDetail} from '../site/assets/evidence.js';
const view=(q,filters={})=>{const r=search(corpus,q,{...defaults,...filters});return {r,groups:presentResults(corpus,r,q).groups};};
for(const q of ['가축방역관의 역할','가축방역관 업무','가축방역관의 권한','가축방역관의 직무','가축방역관이 하는 일','가축방역관 업무 내용을 알려주세요'])test('role intent preserves legal duties: '+q,()=>{
 const {r,groups}=view(q);assert(r.diagnostics.roleSearch);assert(!r.diagnostics.terms.includes('역할'));
 for(const [type,number,paragraph] of [['법률','제7조',3],['시행령','제3조',3],['시행규칙','제49조',null]]){
  const g=groups.find(g=>g.docType===type&&g.articleNumber===number);assert(g?.primary,type+number);assert(g.focus.some(u=>u.paragraph===paragraph));
 }
 assert(groups.some(g=>g.docType==='시행규칙'&&g.articleNumber==='제9조의4'));
 assert(groups.filter(g=>g.docType==='SOP').every(g=>!g.primary));
 assert(!groups.some(g=>/과태료|벌칙/u.test(g.articleTitle)));
});
test('separate officer and assistant duties without transferring authority',()=>{
 const {groups}=view('가축방역사의 역할');
 const law=groups.find(g=>g.docType==='법률'&&g.articleNumber==='제8조');assert(law?.primary);assert(law.focus.some(u=>u.paragraph===2));
 const rule=groups.find(g=>g.docType==='시행규칙'&&g.articleNumber==='제10조');assert(rule?.primary);assert(rule.focus.some(u=>u.paragraph===3));
 assert(!groups.some(g=>g.primary&&g.docType==='법률'&&g.articleNumber==='제7조'));
});
for(const disease of ['구제역','ASF','고병원성AI'])test('role source coverage and disease separation: '+disease,()=>{
 const {groups}=view('가축방역관의 역할',{disease});assert(groups.length);
 assert(groups.every(g=>g.disease==='공통'||g.disease===disease));
 assert(groups.some(g=>g.docType==='법률'&&g.articleNumber==='제7조'&&g.primary));
 assert(groups.some(g=>g.docType==='시행령'&&g.articleNumber==='제3조'&&g.primary));
 assert(groups.some(g=>g.docType==='시행규칙'&&g.articleNumber==='제49조'&&g.primary));
 assert(groups.some(g=>g.docType==='고시'&&g.disease===disease));
 assert(groups.some(g=>g.docType==='SOP'&&g.disease===disease));
});
test('explicit role filters and dates remain binding',()=>{
 const {groups}=view('가축방역관의 역할',{type:'SOP'});assert(groups.some(g=>g.primary));assert(groups.every(g=>g.docType==='SOP'));
 assert(view('가축방역관 역할',{asOf:'2020-01-01'}).groups.length===0);
});

test('a paragraph with numbered children opens its full parent scope',()=>{
 const e=corpus.find(e=>e.doc.type==='법률');
 const detail=articleDetail(corpus,{documentId:e.doc.id,articleNumber:'제7조',paragraph:3,asOf:defaults.asOf});
 assert.equal(detail.scopeLabel,'제7조 제3항');assert(!detail.scopeMissing);assert(detail.scope.length);
 const text=detail.scope.map(p=>p.text).join('');assert(text.includes('검사하거나 관계자에게 질문'));assert(text.includes('운송차량'));assert(!text.includes('⑤'));
 const whole=articleDetail(corpus,{documentId:e.doc.id,articleNumber:'제7조',asOf:defaults.asOf});
 assert(whole.citations.some(c=>corpus.find(e=>e.doc.id===c.documentId)?.doc.type==='시행령'&&c.articleNumber==='제3조'));
});
