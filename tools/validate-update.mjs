import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {eligible,search} from '../site/assets/search.js';
import {presentResults} from '../site/assets/evidence.js';
import {activeArticles} from '../site/assets/provisions.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const flat=s=>s.replace(/\s/gu,'');
function safe(base,relative){const p=path.resolve(base,relative);if(!p.startsWith(path.resolve(base)+path.sep))throw Error('Unsafe snapshot path');return p;}
export function loadSnapshot(site,asOf){
 const manifest=read(path.join(site,'data/manifest.json'));
 return manifest.documents.filter(doc=>eligible(doc,{asOf,type:'전체',disease:'전체'})).map(doc=>({doc,index:read(safe(site,doc.data)),asOf}));
}
export function integrity(site){
 const manifest=read(path.join(site,'data/manifest.json')),issues=[],ids=new Set(),families=new Map();
 for(const doc of manifest.documents){
  if(ids.has(doc.id))issues.push('중복 문서 번호: '+doc.id);ids.add(doc.id);
  for(const [key,digest] of [['data',doc.data_sha256],['pdf',doc.sha256]])if(hash(fs.readFileSync(safe(site,doc[key])))!==digest)issues.push('해시 불일치: '+doc.title+' '+key);
  const index=read(safe(site,doc.data)),pages=new Map(index.pages.map(p=>[p.page,p.text]));
  if(pages.size!==doc.pages||index.pages.some((p,i)=>p.page!==i+1))issues.push('누락·중복 페이지: '+doc.title);
  const parts=[...index.articles.flatMap(a=>a.parts),...index.definitions.flatMap(d=>d.parts||[d.part]),...index.annexes.map(a=>a.part),...index.procedures.flatMap(p=>p.parts),...index.chunks];
  for(const p of parts)if(!pages.get(p.page)?.includes(p.text)||p.display&&flat(p.display)!==flat(p.text))issues.push('원문과 다른 발췌: '+doc.title+' '+p.page);
  const versions=families.get(doc.family)||[];versions.push(doc);families.set(doc.family,versions);
 }
 for(const [family,versions] of families){versions.sort((a,b)=>a.from.localeCompare(b.from));for(let i=0;i<versions.length;i++){
  const d=versions[i];if(!/^\d{4}-\d{2}-\d{2}$/u.test(d.from)||d.to&&d.to<=d.from)issues.push('날짜 범위 오류: '+family);
  if(i&&(!versions[i-1].to||versions[i-1].to>d.from))issues.push('버전 적용 기간 중복: '+family);
 }}
 const catalog=read(path.join(root,'maintenance/catalog.json'));
 const required=catalog.documents.map(d=>d.family);
 for(const item of catalog.documents){const b=item.baseline;if(!b)continue;const d=manifest.documents.find(d=>d.id===b.id);if(!d||d.sha256!==b.sha256||d.data_sha256!==b.data_sha256||d.from!==b.from)issues.push('기존 원문·색인 이력 변경/누락: '+item.family);}
 for(const family of required)if(!families.has(family))issues.push('기존 문서 누락: '+family);
 return [...new Set(issues)];
}
export const criticalQuestions=[
 '살처분 대상 질병','최초신고 시 보상금 경감은?','보상금 최소 보장 기준','가금 계열사의 의무','가축방역사의 자격 요건',
 '법정전염병의 종류','소득안정자금 지원 대상','생계안정자금 지급 근거','구제역 백신 미접종 시 보상금은 어떻게 되죠?'
];
function answer(corpus,question,asOf){
 const result=search(corpus,question,{asOf,disease:'전체',type:'전체'}),view=presentResults(corpus,result,question);
 return view.groups.map(g=>({family:g.doc.family,title:g.title,disease:g.disease,type:g.docType,article:g.articleNumber||g.heading,primary:g.primary,
   scopes:g.focus.map(u=>({label:u.label,text:u.parts.map(p=>p.display||p.text).join('\n')})),
   annex:g.annexExcerpt?.selected.map(u=>({key:u.key,text:u.parts.map(p=>p.display||p.text).join('\n')}))}));
}
function compareArticles(before,after){
 const rows=corpus=>corpus.flatMap(e=>activeArticles(e).map(a=>({family:e.doc.family,number:a.number,title:a.title,text:flat(a.parts.map(p=>p.text).join(''))})));
 const old=rows(before),next=rows(after),changes=[];
 for(const a of old){const b=next.find(b=>b.family===a.family&&b.number===a.number);if(!b||a.text!==b.text)changes.push({kind:b?'changed':'removed',family:a.family,oldNumber:a.number,newNumber:b?.number,title:a.title,
   renumberCandidates:next.filter(b=>b.family===a.family&&b.title===a.title&&b.number!==a.number).map(b=>b.number)});}
 for(const b of next)if(!old.some(a=>a.family===b.family&&a.number===b.number))changes.push({kind:'added',family:b.family,newNumber:b.number,title:b.title});
 return changes;
}
export function criticalCoverage(corpus,asOf){
 return criticalQuestions.filter(q=>{const rows=answer(corpus,q,asOf);if(!rows.length)return true;if(q==='살처분 대상 질병'){const rule=rows.find(g=>g.type==='시행규칙');const body=rule?.scopes.map(u=>flat(u.text)).join('')||'';return !body.includes('제1종가축전염병')||!body.includes('제2종가축전염병')||!body.includes('농림축산식품부장관이정하는');}return false;});
}
export function validateUpdate(stage){
 const plan=read(path.join(stage,'plan.json')),site=path.join(stage,'site'),reports=path.join(stage,'reports');fs.mkdirSync(reports,{recursive:true});
 const before=loadSnapshot(plan.source_site,plan.new_from),after=loadSnapshot(site,plan.new_from),checks=[];
 const issues=integrity(site);checks.push({name:'PDF·색인 해시, 원문 발췌, 버전 기간, 기존 문서 보존',passed:issues.length===0,issues});
 const env={...process.env,LIVESTOCK_SITE_ROOT:site,LIVESTOCK_AS_OF:plan.new_from,LIVESTOCK_REPORT_DIR:reports};
 for(const tool of ['evaluate.mjs','audit-regulation-links.mjs','audit-questions.mjs']){
  const child=spawnSync(process.execPath,[path.join(root,'tools',tool)],{cwd:root,env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
  fs.writeFileSync(path.join(reports,tool+'.log'),(child.stdout||'')+'\n'+(child.stderr||''));
  checks.push({name:tool,passed:child.status===0,exit:child.status,error:child.error?.message});
 }
 const fixtures=read(path.join(root,'tests/fixtures/questions.json'));
 const questions=[...new Set([...fixtures.map(f=>f.question),...criticalQuestions])];
 const fingerprint=rows=>JSON.stringify(rows.map(g=>({...g,scopes:g.scopes.map(u=>({...u,text:flat(u.text)})),annex:g.annex?.map(u=>({...u,text:flat(u.text)}))})));
 const questionChanges=questions.flatMap((question,i)=>{const a=answer(before,question,plan.new_from),b=answer(after,question,plan.new_from);return fingerprint(a)===fingerprint(b)?[]:[{id:'q-'+i,question,before:a,after:b}];});
 const missing=criticalCoverage(after,plan.new_from);
 checks.push({name:'사용자 제보 핵심 질문의 근거 유지',passed:missing.length===0,issues:missing});
 const report={schema:1,asOf:plan.new_from,passed:checks.every(c=>c.passed),checks,
  article_changes:compareArticles(before,after),question_changes:questionChanges,
  source_bound_profiles:{newProfileRequired:!plan.no_change,oldSopProceduresReused:false,oldImageCropsReused:false},
  limitations:['검사 통과는 법률 해석이나 전체 질문의 정답률을 보증하지 않습니다.','조문 번호·별표 구조 변경으로 검사가 실패하면 연결 규칙 또는 기대 근거를 원문에 맞게 검토해야 합니다.','새 SOP의 절차·참고자료 제외 범위와 표·그림은 검토 프로필에서 확인해야 합니다.']};
 fs.writeFileSync(path.join(stage,'validation.json'),JSON.stringify(report,null,2)+'\n');
 return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const report=validateUpdate(path.resolve(process.argv[2]));console.log(JSON.stringify({passed:report.passed,checks:report.checks,articleChanges:report.article_changes.length,questionChanges:report.question_changes.length},null,2));if(!report.passed)process.exitCode=1;
}
