import test from 'node:test';import assert from 'node:assert/strict';import {corpus,defaults} from '../tools/evaluate.mjs';import {search} from '../site/assets/search.js';import {presentResults} from '../site/assets/evidence.js';
for(const q of ['가축방역사의 자격 요건','방역사 자격요건','가축 방역사의 자격','가축방역사 위촉 요건','가축방역사의 자격과 교육과정'])test('qualification request selects substantive eligibility and appointment education: '+q,()=>{
 const r=search(corpus,q,defaults),groups=presentResults(corpus,r,q).groups;assert.deepEqual(groups.map(g=>[g.docType,g.articleNumber]),[['법률','제8조'],['시행규칙','제10조']]);
 assert.deepEqual(groups[0].focus.map(u=>u.paragraph),[1,4]);const rule=groups[1];assert(rule.primary);assert.deepEqual(rule.focus.map(u=>u.paragraph),[1,2]);const text=rule.focus.flatMap(u=>u.parts).map(p=>p.text).join('');for(const term of ['축산산업기사','동물보건사','졸업예정자','6월 이상','1년 이상','24시간 이상'])assert(text.includes(term),term);assert(!text.includes('업무범위'));assert(!text.includes('수당을'));assert(!groups.some(g=>g.articleTitle==='규제의 재검토'));
});
test('qualification source filters and dates are binding',()=>{
 for(const filters of [{type:'시행규칙'},{type:'법률'},{type:'SOP'},{asOf:'2000-01-01'}]){const r=search(corpus,'가축방역사의 자격 요건',{...defaults,...filters});if(filters.type==='SOP'||filters.asOf)assert.equal(r.results.length,0);else assert(r.results.every(p=>p.docType===filters.type));}
});
