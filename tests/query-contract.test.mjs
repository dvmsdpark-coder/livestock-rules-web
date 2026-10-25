import test from 'node:test';
import assert from 'node:assert/strict';
import {corpus,defaults} from '../tools/evaluate.mjs';
import {search} from '../site/assets/search.js';
import {presentResults} from '../site/assets/evidence.js';
import {literalSubjects,satisfiesSubjects} from '../site/assets/query-contract.js';

for(const question of ['연구위원','가축방역심의회 연구위원','가축방역심의회의 연구위원','가축방역심의회 연구위원의 업무','가축방역심의회 연구위원 역할','가축방역심의회 연구위원을 알려주세요'])test('body-only subject reaches its substantive provision: '+question,()=>{
 const result=search(corpus,question,defaults),groups=presentResults(corpus,result,question).groups;
 assert.deepEqual(groups.map(g=>[g.docType,g.articleNumber]),[['법률','제4조']]);
 assert.deepEqual(groups[0].focus.map(u=>u.paragraph),[5,6]);
 const text=groups[0].focus.flatMap(u=>u.parts).map(p=>p.text).join('');
 for(const term of ['조사','연구','상호협력','임무','5. 그 밖에'])assert(text.includes(term),term);
 assert(result.diagnostics.scopeTerms.includes('연구위원'));
});
for(const type of ['시행령','시행규칙','고시','SOP'])test('committee mentions cannot substitute for researchers in '+type,()=>{
 assert.equal(search(corpus,'가축방역심의회 연구위원',{...defaults,type}).results.length,0);
});
for(const suffix of ['보상금','과태료','자격','우주선'])test('additional conditions cannot be silently dropped: '+suffix,()=>{
 assert.equal(search(corpus,'가축방역심의회 연구위원 '+suffix,defaults).results.length,0);
});
test('researcher query obeys effective date',()=>assert.equal(search(corpus,'가축방역심의회 연구위원',{...defaults,asOf:'2000-01-01'}).results.length,0));

// Vary corpus-only subjects independently of the production dictionaries.
// The heading is deliberately a broad organization; qualifiers only occur in body text.
const nouns=['연구위원','실험담당자','분석보고서','수의과대학','전담조직','안전장비','심사위원','검체보관실'];
const entries=[{index:{pages:[{text:nouns.join(' 및 ')}]}}];
for(const noun of nouns)for(const suffix of ['','의 업무','을 알려주세요'])test('literal subject survives body-only vocabulary: '+noun+suffix,()=>{
 const terms=literalSubjects(entries,'가축방역심의회 '+noun+suffix,['가축방역심의회']);
 assert.deepEqual(terms,[noun]);
 assert(satisfiesSubjects('가축방역심의회 '+noun+'에 관한 규정',terms));
 assert(!satisfiesSubjects('가축방역심의회에 부의한다',terms));
});
test('spacing, particles and recognized synonyms preserve the same subject',()=>{
 assert.deepEqual(literalSubjects(entries,'가축 방역 심의회의 연구위원은 누구인가요?',['가축방역심의회']),['연구위원']);
 assert(satisfiesSubjects('연구위\n원을 둘 수 있다',['연구위원']));
 assert.deepEqual(literalSubjects(entries,'아프리카 돼지 열병 방역대 설정'),[]);
});
test('a qualifier must occur in the shown excerpt, not merely somewhere in its document',()=>{
 const q='가축방역사 수당',groups=presentResults(corpus,search(corpus,q,defaults),q).groups;
 assert(groups.length>0);
 for(const g of groups){const text=g.focus.flatMap(u=>u.parts).map(p=>p.text).join('');assert(text.includes('수당'));}
});
