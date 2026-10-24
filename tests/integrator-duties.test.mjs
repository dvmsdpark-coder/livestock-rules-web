import test from 'node:test';import assert from 'node:assert/strict';import {corpus,defaults} from '../tools/evaluate.mjs';import {search} from '../site/assets/search.js';import {presentResults} from '../site/assets/evidence.js';
for(const question of ['가금 계열사의 의무','가금 계열화사업자의 방역 의무','가금 축산계열화사업자 준수사항','가금 계열사의 방역관리 업무','가금 축산 계열화 사업자의 의무'])test('integrator obligation follows responsible actor and actual legal delegation: '+question,()=>{
 const r=search(corpus,question,defaults),groups=presentResults(corpus,r,question).groups;assert(r.diagnostics.actors.includes('축산계열화사업자'));
 for(const [type,number,paragraphs] of [['법률','제6조의2',[1,2]],['법률','제6조의3',[1,2,3]],['시행규칙','제9조의2',[1,2,3,4]],['시행규칙','제9조의3',[1,2,3,4]]]){const g=groups.find(g=>g.docType===type&&g.articleNumber===number);assert(g?.primary,type+number);assert.deepEqual(g.focus.map(u=>u.paragraph),paragraphs);}
 assert.equal(groups[0].articleNumber,'제6조의2');assert(groups.filter(g=>g.docType==='SOP').every(g=>!g.primary));
 if(/의무|준수사항/.test(question))assert(!groups.some(g=>g.docType==='SOP'));
});
test('integrator legal duties respect explicit document type and date filters',()=>{
 for(const filters of [{type:'법률'},{type:'시행규칙'},{asOf:'2000-01-01'},{type:'SOP'}]){const r=search(corpus,'가금 계열사의 의무',{...defaults,...filters});if(filters.type==='SOP'||filters.asOf)assert.equal(r.results.length,0);else assert(r.results.every(p=>p.docType===filters.type));}
});
