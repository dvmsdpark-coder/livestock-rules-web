import test from 'node:test';import assert from 'node:assert/strict';import {corpus,defaults} from '../tools/evaluate.mjs';import {search} from '../site/assets/search.js';import {presentResults} from '../site/assets/evidence.js';
const run=(q,filters={})=>{const r=search(corpus,q,{...defaults,...filters});return {r,groups:presentResults(corpus,r,q).groups};};
for(const q of ['살처분 대상 질병','살처분 대상 질병 종류','살처분 대상 전염병 목록','어떤 질병이 살처분 대상인가요?','살처분해야 하는 질병 종류를 알려주세요'])test('culling disease scope includes both grades, conditional additions and legal basis: '+q,()=>{
 const {r,groups}=run(q);assert.equal(r.diagnostics.purpose,'culling-diseases');assert.deepEqual(groups.map(g=>[g.docType,g.articleNumber]),[['법률','제20조'],['법률','제28조'],['시행규칙','제23조']]);assert(groups.every(g=>g.primary));
 const rule=groups[2];assert.deepEqual(rule.focus.filter(u=>u.item).map(u=>u.item),[1,2,3]);const text=rule.focus.flatMap(u=>u.parts).map(p=>p.text).join('');for(const term of ['우역','우폐역','구제역','아프리카돼지열병','돼지열병','뉴캣슬병','고병원성 조류인플루엔자','브루셀라병','H5','H7','농림축산식품부장관이 정하는'])assert(text.includes(term),term);assert(!text.includes('70일'));assert(!text.includes('별지 제9호'));
 assert.deepEqual(groups[0].focus.map(u=>u.paragraph),[1,2]);
});
test('grade-specific culling list does not substitute a different grade',()=>{
 for(const grade of [1,2]){const {groups}=run('살처분 대상 제'+grade+'종 질병');const rule=groups.find(g=>g.docType==='시행규칙');assert.deepEqual(rule.focus.filter(u=>u.item).map(u=>u.item),[grade,3]);}assert.equal(run('살처분 대상 제3종 질병').groups.length,0);
});
test('culling list respects document/date restrictions and does not absorb compensation or postponement',()=>{
 assert.equal(run('살처분 대상 질병',{type:'SOP'}).groups.length,0);assert.equal(run('살처분 대상 질병',{asOf:'2000-01-01'}).groups.length,0);assert(run('살처분 대상 질병',{type:'시행규칙'}).groups.every(g=>g.docType==='시행규칙'));
 for(const q of ['살처분 대상 질병 보상금','살처분 대상 질병 연기 기간'])assert.notEqual(run(q).r.diagnostics?.purpose,'culling-diseases');
});
