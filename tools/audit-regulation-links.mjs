import fs from 'node:fs';import {fileURLToPath} from 'node:url';
import {corpus,defaults} from './evaluate.mjs';
import {activeArticles} from '../site/assets/provisions.js';
import {references,articleIn,legalUnits,presentResults} from '../site/assets/evidence.js';
import {sopIndex} from '../site/assets/sop-index.js';
import {search} from '../site/assets/search.js';
export function auditLinks(){
 const stats=[],issues=[],seen=new Set();let links=0;
 for(const e of corpus){
  const parts=e.doc.type==='SOP'?sopIndex(e).sections.flatMap(s=>s.parts):activeArticles(e,defaults.asOf).flatMap(a=>a.parts);
  let linked=0;
  for(const part of parts)for(const ref of references(part.display||part.text,e.doc,corpus)){
   const key=e.doc.id+':'+part.page+':'+ref.documentId+':'+ref.articleNumber+':'+ref.paragraph+':'+ref.item;if(seen.has(key))continue;seen.add(key);
   linked++;links++;
   const target=corpus.find(t=>t.doc.id===ref.documentId),a=target&&articleIn(target,ref.articleNumber,defaults.asOf);
   if(!a||ref.paragraph&&!legalUnits(a).units.some(u=>u.paragraph===ref.paragraph)||ref.item&&!legalUnits(a).units.some(u=>u.item===ref.item&&(!ref.paragraph||u.paragraph===ref.paragraph)))issues.push({source:e.doc.title,page:part.page,label:ref.label,reason:'연결 대상 항·호 확인 필요'});
  }
  stats.push({document:e.doc.id,title:e.doc.title,type:e.doc.type,sourceDate:e.doc.from,dateNote:e.doc.date_note||'',checkedParts:parts.length,resolvedReferences:linked});
 }
 const versionReview=[];
 for(const e of corpus.filter(e=>e.doc.type==='SOP'))for(const n of corpus.filter(n=>n.doc.type==='고시'&&n.doc.disease===e.doc.disease&&n.doc.from>e.doc.from)){
  versionReview.push({sop:e.doc.title,sopDate:e.doc.from,sopDateNote:e.doc.date_note,notice:n.doc.title,noticeDate:n.doc.from,reason:'SOP 검색 기준일 이후 고시가 개정되었습니다. 변경 내용과 SOP 적용 문구의 대조 검토가 필요합니다. 이 날짜 차이만으로 충돌을 판정하지 않습니다.'});
 }
 const reporting=[];
 for(const disease of ['구제역','ASF','고병원성AI']){
  const q=disease+' 신고 방법과 절차는 어떻게 되나요?',r=search(corpus,q,defaults),v=presentResults(corpus,r,q);
  const law=v.groups.find(g=>g.docType==='법률'&&g.articleNumber==='제11조'),rule=v.groups.find(g=>g.docType==='시행규칙'&&g.articleNumber==='제13조'),sop=v.groups.filter(g=>g.docType==='SOP');
  const ruleText=rule?.focus.flatMap(u=>u.parts).map(p=>p.text).join('')||'';
  reporting.push({disease,question:q,law:Boolean(law),rule:Boolean(rule),sop:sop.length>0,oralWrittenElectronic:ruleText.includes('구두ㆍ서면 또는 전자문서'),requiredFields:ruleText.includes('신고자의 성명 및 주소'),afterReceipt:ruleText.includes('검안 또는 진단'),sources:v.groups.map(g=>({type:g.docType,title:g.title,article:g.articleNumber,pages:[...new Set(g.parts.map(p=>p.page))]}))});
 }
 const benefits=[];
 for(const [name,lawParagraph,decreeArticle] of [['생계안정',1,'제12조'],['소득안정',2,'제12조의2']]){
  const q=name+'자금 지급 근거',r=search(corpus,q,defaults),v=presentResults(corpus,r,q);
  const law=v.groups.find(g=>g.docType==='법률'&&g.articleNumber==='제49조'),decree=v.groups.find(g=>g.docType==='시행령'&&g.articleNumber===decreeArticle);
  benefits.push({name,lawParagraph,decreeArticle,law:Boolean(law?.focus.some(u=>u.paragraph===lawParagraph)),delegation:Boolean(law?.focus.some(u=>u.paragraph===3)),decree:Boolean(decree),wrongScheme:law?.focus.some(u=>u.paragraph===(lawParagraph===1?2:1))||false});
 }
 return {asOf:defaults.asOf,scope:'등록 문서의 인용 연결·신고 근거 누락·문서 버전 차이 점검. 법률 해석상 충돌 여부를 확정하는 감사가 아닙니다.',resolvedReferences:links,invalidLinks:issues,documents:stats,reporting,benefits,versionReview,limitations:['인용 해석기가 연결하지 못한 외부 법령·모호한 인용은 이 연결 검증 수에 포함되지 않습니다.','같은 조문 번호가 존재해도 개정 전후 내용이 같다는 뜻은 아닙니다.','SOP의 공식 시행일 미확인 사항과 표·그림의 의미는 별도 검토가 필요합니다.']};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const r=auditLinks(),root=new URL('../docs/',import.meta.url);fs.mkdirSync(root,{recursive:true});
 fs.writeFileSync(new URL('regulation-links.json',root),JSON.stringify(r,null,2)+'\n');
 fs.writeFileSync(new URL('REGULATION_LINKS.md',root),[
 '# 규정 연결 및 버전 점검','',r.scope,'',
 '- 기준일: '+r.asOf,'- 등록 문서: '+r.documents.length+'종','- 중복 제거한 페이지별 인용 연결: '+r.resolvedReferences+'건','- 연결된 대상의 항·호 유효성 오류: '+r.invalidLinks.length+'건','',
 '## 신고 근거 대조','',
 '| 질병 | 법 제11조 | 규칙 제13조 | SOP | 신고방법·필수사항·접수후조치 |','| --- | --- | --- | --- | --- |',
 ...r.reporting.map(x=>'| '+x.disease+' | '+(x.law?'확인':'누락')+' | '+(x.rule?'확인':'누락')+' | '+(x.sop?'확인':'누락')+' | '+(x.oralWrittenElectronic&&x.requiredFields&&x.afterReceipt?'검색 발췌에 포함':'확인 필요')+' |'),
 '', '신고 기관·의무는 법, 신고방법과 포함 사항 및 접수 후 조치는 시행규칙, 현장 대응은 고시·SOP에서 구분해 확인합니다. 서로 다른 설명의 상세도가 곧 충돌을 뜻하지 않습니다.',
 '', '## 안정비용 지원 근거 대조','',
 '| 구분 | 법 제49조의 근거 항 | 시행령 | 위임 조항 포함 | 다른 지원 항 혼입 |','| --- | --- | --- | --- | --- |',
 ...r.benefits.map(x=>'| '+x.name+' | 제'+x.lawParagraph+'항 | '+x.decreeArticle+' | '+(x.delegation?'제3항 확인':'확인 필요')+' | '+(x.wrongScheme?'확인 필요':'없음')+' |'),
 '', '이 표는 검색 발췌의 근거 연결을 점검합니다. 지원 여부나 금액을 확정하는 표가 아닙니다.',
 '', '## 버전 대조가 필요한 자료','',
 ...r.versionReview.map(v=>'- '+v.sop+' ('+v.sopDate+') → '+v.notice+' ('+v.noticeDate+'): '+v.reason),
 '', '## 한계','',...r.limitations.map(x=>'- '+x),''
 ].join('\n'));
 console.log(JSON.stringify({resolvedReferences:r.resolvedReferences,invalidLinks:r.invalidLinks.length,reporting:r.reporting.map(x=>({disease:x.disease,law:x.law,rule:x.rule,sop:x.sop,methods:x.oralWrittenElectronic,fields:x.requiredFields,afterReceipt:x.afterReceipt})),benefits:r.benefits,versionReview:r.versionReview.length},null,2));
 if(r.benefits.some(x=>!x.law||!x.delegation||!x.decree||x.wrongScheme)||r.invalidLinks.length||r.reporting.some(x=>!x.law||!x.rule||!x.sop||!x.oralWrittenElectronic||!x.requiredFields||!x.afterReceipt))process.exitCode=1;
}
