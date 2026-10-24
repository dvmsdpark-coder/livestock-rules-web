import test from 'node:test';import assert from 'node:assert/strict';
import {corpus,defaults} from '../tools/evaluate.mjs';
import {search} from '../site/assets/search.js';import {presentResults} from '../site/assets/evidence.js';
for(const [root,paragraph,article] of [['소득안정',2,'제12조의2'],['생계안정',1,'제12조']]){
 for(const ending of ['자금 지급 근거','비용 지원 대상','지원금 지급',' 지급 기준'])test(root+ending,()=>{
  const q=root+ending,r=search(corpus,q,defaults),v=presentResults(corpus,r,q);
  const law=v.groups.find(g=>g.docType==='법률'&&g.articleNumber==='제49조'),decree=v.groups.find(g=>g.docType==='시행령'&&g.articleNumber===article);
  assert(law&&decree);assert(law.primary&&decree.primary);
  assert(law.focus.some(u=>u.paragraph===paragraph));assert(law.focus.some(u=>u.paragraph===3));
  assert(!law.focus.some(u=>u.paragraph===(paragraph===1?2:1)));
  assert(!v.groups.some(g=>g.docType==='시행령'&&g.articleNumber===(paragraph===1?'제12조의2':'제12조')));
  const text=decree.focus.flatMap(u=>u.parts).map(p=>p.text).join('').replace(/\s/gu,'');
  assert(/지원하지(?:아니할|않을)수있다/u.test(text));
  assert(decree.focus.flatMap(u=>u.parts).some(p=>(p.references||[]).some(ref=>ref.articleNumber==='제49조'&&ref.paragraph===paragraph)));
 });
}
test('life-support upper limit retains the separate upward-adjustment paragraph',()=>{
 const q='생계안정비용 지급 상한',r=search(corpus,q,defaults),v=presentResults(corpus,r,q),g=v.groups.find(g=>g.docType==='시행령');
 assert(g);assert(g.focus.some(u=>u.paragraph===2));assert(g.focus.some(u=>u.paragraph===3));
 const t=g.focus.flatMap(u=>u.parts).map(p=>p.text).join('');assert(t.includes('상향 조정'));
});
test('combined and spaced benefit queries keep the two schemes distinct',()=>{
 for(const q of ['소득 안정 자금 지급 근거','생계안정 소득안정 차이']){
 const r=search(corpus,q,defaults),v=presentResults(corpus,r,q);assert(v.groups.some(g=>g.docType==='법률'&&g.articleNumber==='제49조'));
 assert(v.groups.some(g=>g.docType==='시행령'&&g.articleNumber==='제12조의2'));
 if(q.includes('생계'))assert(v.groups.some(g=>g.docType==='시행령'&&g.articleNumber==='제12조'));
 }
});
test('benefit retrieval preserves type and date filters without substituting an unavailable law',()=>{
 const r=search(corpus,'소득안정자금 지급 근거',{...defaults,type:'시행령'});assert(r.results.length);assert(r.results.every(p=>p.docType==='시행령'));
 const old=search(corpus,'소득안정자금 지급 근거',{...defaults,asOf:'2000-01-01'});assert.equal(old.results.length,0);
});
