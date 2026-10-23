import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {search} from '../site/assets/search.js';
const site=fileURLToPath(new URL('../site/',import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(site,'data/manifest.json'),'utf8'));
const corpus=manifest.documents.map(doc=>({doc,index:JSON.parse(fs.readFileSync(path.join(site,doc.data),'utf8'))}));
const defaults={asOf:'2026-10-23',disease:'전체',type:'전체'};
const run=(q,filters={})=>search(corpus,q,{...defaults,...filters});
const sopPages=result=>result.results.filter(r=>r.docType==='SOP').map(r=>r.page);

test('published source hashes and full page provenance',()=>{
 assert.equal(manifest.schema,1);assert.equal(corpus.length,5);
 for(const {doc,index} of corpus){
  for(const [filename,digest] of [[doc.pdf,doc.sha256],[doc.data,doc.data_sha256]]){
   const bytes=fs.readFileSync(path.join(site,filename));assert(bytes.length<25*1024*1024);assert.equal(createHash('sha256').update(bytes).digest('hex'),digest);
  }
  const pages=new Map(index.pages.map(p=>[p.page,p.text]));assert.equal(pages.size,doc.pages);
  const parts=[...index.articles.flatMap(a=>a.parts),...index.definitions.map(d=>d.part),...index.annexes.map(a=>a.part),...index.procedures.flatMap(p=>p.parts),...index.chunks];
  for(const part of parts){assert(pages.get(part.page)?.includes(part.text),`${doc.title} PDF ${part.page}`);assert.equal(part.display.replace(/\s/gu,''),part.text.replace(/\s/gu,''));}
 }
});
for(const q of ['가축의 정의','가축 정의','가축이란 무엇인가요?','가축의 정의를 알려 주세요','가축의 정의는 무엇인가요?'])test('general definition: '+q,()=>{
 const r=run(q);assert.equal(r.mode,'definition');assert.equal(r.results.length,1);assert.equal(r.results[0].docType,'법률');assert.equal(r.results[0].page,4);assert(!r.results[0].text.includes('가축전염병”이란'));
});
for(const q of ['가축의 범위','가축의 범위를 알려주세요','가축의 범위는 무엇인가요?'])test('exact article: '+q,()=>{
 const r=run(q);assert.equal(r.mode,'article');assert.equal(r.results.length,1);assert.equal(r.results[0].docType,'시행령');assert.equal(r.results[0].page,2);assert(r.results[0].text.includes('고양이'));assert(!/과태료|보상금/u.test(r.results[0].text));
});
for(const q of ['구제역이 발생하면 신고를 어디에 해야하죠?','구제역이 의심되면 어디에 신고하나요?','구제역은 누구에게 신고하나요?','구제역 신고기관은 어디인가요?'])test('reporting: '+q,()=>{
 const r=run(q);assert.equal(r.mode,'procedure');assert.deepEqual(sopPages(r),[69,159]);assert(r.results.some(x=>x.docType==='법률'));assert(r.results.some(x=>x.docType==='시행규칙'));assert(r.results.filter(x=>x.docType==='SOP').every(x=>!x.text.includes('2.1')));
});
for(const q of ['구제역 이동제한은 언제 풀리나요?','구제역 이동제한 해제 조건은 무엇인가요?','구제역 이동제한은 며칠 후 해제되나요?'])test('complete release procedure: '+q,()=>{
 const r=run(q);assert.equal(r.mode,'procedure');assert.deepEqual(sopPages(r),[152,153,154,280,281,282]);assert.equal(new Set(r.results.filter(x=>x.docType==='SOP').map(x=>x.scenario)).size,2);
});
for(const q of ['구제역 발생농장은 어떻게 소독하나요?','구제역 농장 청소와 소독 요령을 알려주세요','구제역 발생 농장 소독 방법'])test('complete disinfection: '+q,()=>{
 const r=run(q);assert.equal(r.mode,'procedure');assert.deepEqual(sopPages(r),[111,112,229,230,231,232,233,234,235]);
});
for(const q of ['구제역 방역대는 어떻게 설정되나요?','구제역 방역지역 설정 기준','구제역 방역구역은 어떻게 정하나요?','구제역 방역대의 범위가 궁금합니다'])test('zone concept and setting: '+q,()=>{
 const r=run(q);assert.equal(r.mode,'zone');assert(r.results.some(x=>x.heading.includes('관리지역')));assert(r.results.some(x=>x.heading.includes('보호지역')));assert(r.results.some(x=>x.heading.includes('예찰지역')));assert(r.results.some(x=>x.heading.includes('시장ㆍ군수ㆍ구청장의 조치')));assert(r.results.some(x=>x.text.includes('방역지역을 다시 설정')));assert(r.results[0].heading.endsWith('방역지역'));assert(r.results.every(x=>x.docType==='고시'&&x.disease==='구제역'));
});
for(const q of ['구제역 신고를 안하면 과태료는?','구제역 농장 소독약은 몇 배 희석하나요?','구제역 이동제한 해제와 소독 방법을 알려주세요','구제역 방역대책은 무엇인가요?'])test('do not reduce different issues: '+q,()=>{
 assert(!['procedure','zone'].includes(run(q).mode));
});
test('document type and disease filters are enforced',()=>{
 assert(run('구제역이 발생하면 신고를 어디에 해야하죠?',{type:'법률'}).results.every(r=>r.docType==='법률'));
 assert(run('구제역 이동제한은 언제 풀리나요?',{type:'SOP'}).results.every(r=>r.docType==='SOP'));
 assert.equal(run('구제역 방역대는 어떻게 설정되나요?',{disease:'ASF'}).results.length,0);
});
test('effective dates are applied before searching',()=>{
 assert.equal(run('가축의 정의',{asOf:'2026-09-30'}).results.length,0);
 assert.equal(run('가축의 범위',{asOf:'2026-04-20'}).results.length,0);
 assert.equal(sopPages(run('구제역 신고기관은 어디인가요?',{asOf:'2026-05-05'})).length,0);
 assert.equal(sopPages(run('구제역 신고기관은 어디인가요?',{asOf:'2026-05-06'})).length,2);
});
test('annex number is exact and does not include subnumbered forms',()=>{
 const r=run('별지 제1호서식',{type:'시행규칙'});assert.equal(r.mode,'annex');assert(r.results.length>0);assert(r.results.every(r=>r.kind==='form'&&!/제1호의/u.test(r.heading)));
 const table=run('별표 2',{type:'고시'});assert(table.results.some(r=>r.page===26));assert(table.results.every(r=>r.kind==='table'));
});
test('unknown term and absent exact article return no substitutes',()=>{
 assert.equal(run('우주방역가축의 정의').results.length,0);
 assert.equal(run('제9999조').results.length,0);
});
test('no private fields in public JSON',()=>{
 const forbidden=new Set(['storage_path','review_note','raw_text','ocr_error','admin_sessions','session_secret','database_url','admin_password_hash']);
 function visit(x){if(!x||typeof x!=='object')return;for(const [k,v]of Object.entries(x)){assert(!forbidden.has(k.toLowerCase()),k);visit(v);}}
 visit(manifest);for(const {index} of corpus)visit(index);
});
