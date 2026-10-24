import test from 'node:test';import assert from 'node:assert/strict';
import {auditLinks} from '../tools/audit-regulation-links.mjs';
import {corpus,defaults} from '../tools/evaluate.mjs';import {search} from '../site/assets/search.js';import {presentResults} from '../site/assets/evidence.js';
test('registered citation targets and reporting source chain remain valid',()=>{
 const r=auditLinks();assert(r.resolvedReferences>100);assert.equal(r.documents.length,11);assert.deepEqual(r.invalidLinks,[]);assert(r.roles.every(x=>x.law&&x.decree&&x.rule&&x.notice&&x.sop&&!x.wrongDisease));
 assert(r.reporting.every(x=>x.law&&x.rule&&x.sop&&x.oralWrittenElectronic&&x.requiredFields&&x.afterReceipt));
 assert(r.versionReview.some(x=>x.sop.includes('아프리카돼지열병')));assert(r.versionReview.some(x=>x.sop.includes('조류인플루엔자')));
});
for(const q of ['신고 방법과 절차','가축전염병 신고방법은 어떻게 되나요?','구제역 신고 절차','ASF 신고 방법','HPAI 신고사항'])test('reporting method: '+q,()=>{
 const r=search(corpus,q,defaults),v=presentResults(corpus,r,q);assert.equal(r.mode,'procedure');
 const rule=v.groups.find(g=>g.docType==='시행규칙'&&g.articleNumber==='제13조');assert(rule);
 assert.deepEqual(rule.focus.map(u=>u.paragraph),[1,3,4]);
 assert(rule.fullParts.map(p=>p.text).join('').replace(/\s/gu,'').includes('신고를하지아니할수있다'));
});
test('reporting filters and explicit titles remain binding',()=>{
 const q='구제역 신고 방법',r=search(corpus,q,{...defaults,type:'SOP'});assert(r.results.length);assert(r.results.every(p=>p.docType==='SOP'));

});

