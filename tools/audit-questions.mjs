import fs from 'node:fs';import {fileURLToPath} from 'node:url';
import {corpus,defaults,fixtures} from './evaluate.mjs';import {search} from '../site/assets/search.js';import {presentResults} from '../site/assets/evidence.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../tests/fixtures/'+name,import.meta.url)));
const spaced=q=>q.replace(/가축방역관|예방접종|이동제한|방역대|축산차량|출입기록|생계안정|소득안정|역학조사|가축전염병|법정전염병|발생농장|재입식|야생조류/gu,w=>w.slice(0,2)+' '+w.slice(2));
const variants=q=>[q,spaced(q),'  '+q.replace(/\s/gu,'  ')+'  ','안녕하세요. '+q+' 알려주세요'];
const run=(q,filters={})=>{const result=search(corpus,q,{...defaults,...filters});return {result,groups:presentResults(corpus,result,q).groups};};
export function auditQuestions(){
 const cases=[];
 for(const f of fixtures)for(const [i,q] of variants(f.question).entries()){
  const {result,groups}=run(q,f.filters),rank=groups.slice(0,6).findIndex(g=>g.docType===f.expected.type&&g.disease===f.expected.disease&&g.articleNumber===f.expected.article);
  cases.push({id:f.id+'-'+i,category:'source-recall',question:q,expected:f.expected,pass:rank>=0,rank:rank+1,mode:result.mode});
 }
 for(const f of read('sop-questions.json'))for(const [i,q] of variants(f.question).entries()){
  const {groups}=run(q,{type:'SOP'});cases.push({id:'sop-'+f.id+'-'+i,category:'sop-source',question:q,pass:groups.some(g=>g.primary&&g.disease===f.disease&&g.heading===f.heading&&g.parts.some(p=>p.page===f.page))});
 }
 for(const f of read('sop-precision.json'))for(const [i,q] of variants(f.question).entries()){
  const primary=run(q,{type:'SOP'}).groups.filter(g=>g.primary);cases.push({id:'noise-'+f.id+'-'+i,category:'sop-noise',question:q,pass:primary.length>0&&primary.every(g=>f.allowed.includes(g.heading))});
 }
 const expectations=[
  ['가축 방역관의 업무를 알려주세요','법률','제7조',3],['가축 방역사의 역할','법률','제8조',2],
  ['법정 전염병에는 어떤 것들이 있나요?','법률','제2조',null],
  ['구제역 의심 소를 발견했어요 어디로 연락하나요?','법률','제11조',1],
  ['농장에 남은 먹이는 어떻게 버리나요?','법률','제23조',1],
  ['백신을 맞히지 않으면 보상금이 줄어드나요?','법률','제48조',3],
  ['가축전염병 신고 안 하면 처벌받나요?','법률','제55조의2',null],
  ['소득 안정 자금 지원 대상이 누구인가요?','법률','제49조',2],
  ['생계 안정 비용은 얼마나 받을 수 있나요?','법률','제49조',1]
 ];
 for(const [q,type,article,paragraph] of expectations){const {groups}=run(q),g=groups.find(g=>g.docType===type&&g.articleNumber===article);let pass=!!g&&g.focus.length>0&&(!paragraph||g.focus.some(u=>u.paragraph===paragraph));
  if(q.includes('처벌'))pass&&=groups.every(g=>g.docType==='법률'&&['제55조의2','제57조'].includes(g.articleNumber));
  if(q.includes('안정')){pass&&=g.focus.every(u=>u.paragraph===paragraph||u.paragraph===3);}
  cases.push({id:'meaning-'+cases.length,category:'meaning-and-scope',question:q,expected:{type,article,paragraph},pass});
 }
 const negative=[
  ['우주전염병의 종류',{}],['사람 법정전염병 종류',{}],['식물 법정전염병 종류',{}],['종류',{}],['규정의 종류',{}],['제4종 법정전염병 종류',{}],
  ['구제역 사료 처리 우주선',{}],['ASF 보상금 피자',{}],['HPAI 소독 우주선',{}],
  ['돼지를 다시 키우려면 어떤 조건이 필요한가요?',{}],['방역대 설정',{}],['이동제한 해제',{}],
  ['구제역 신고',{disease:'ASF'}],['ASF 사료 처리',{disease:'고병원성AI'}],['HPAI 방역대 설정',{disease:'구제역'}],
  ['구제역 ASF 방역대 설정',{}],['법정전염병의 종류',{type:'SOP'}],['가축방역관 역할',{asOf:'2000-01-01'}],['신고 절차',{asOf:'2000-01-01'}]
 ];
 for(const [q,filters] of negative){const {result}=run(q,filters);cases.push({id:'negative-'+cases.length,category:'unsupported-or-conflicting',question:q,filters,pass:result.results.length===0});}
 return {schema:1,asOf:defaults.asOf,documents:corpus.length,total:cases.length,passed:cases.filter(c=>c.pass).length,categories:[...new Set(cases.map(c=>c.category))].map(category=>({category,total:cases.filter(c=>c.category===category).length,passed:cases.filter(c=>c.category===category&&c.pass).length})),cases,limitations:['원문 도달성과 발췌 범위의 회귀 검사이며, 임의 질문의 정답률이나 법률 해석의 정합성을 보증하지 않습니다.','등록 원문에 없는 일부 명사를 탐지하지만, 문서에 존재하는 단어의 모든 의미·조건 조합이나 복합 질문을 이해하는 것은 아닙니다.','표현 변형 사례는 서로 독립적인 전문가 평가 문항이 아닙니다. 미검토 동의어·축종·예외 조건은 추가 검토가 필요합니다.']};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const report=auditQuestions();fs.writeFileSync(new URL('../docs/question-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(new URL('../docs/QUESTION_AUDIT.md',import.meta.url),['# 단어와 질문 문장 연결 점검','',`기준일 ${report.asOf} · 문서 ${report.documents}종 · 검사 ${report.passed}/${report.total}`,'','| 유형 | 통과 / 전체 |','| --- | --- |',...report.categories.map(c=>`| ${c.category} | ${c.passed} / ${c.total} |`),'','기존 36개 질문에 띄어쓰기·공백·인사말/요청 표현을 적용했습니다. SOP 질문은 기대 절과 페이지 도달, SOP 오탐 검사는 기본 표시 절의 허용 목록을 확인합니다. 별도 질문에서는 항 단위 발췌, 소득/생계 구분, 신고 절차/벌칙 구분을 검사합니다. 미등록 대상·상충 질병·미등록 기준일·질병이 필요한 질문은 다른 근거로 대체하지 않는지 확인합니다.','','검사 명령: `npm run audit:questions`. GitHub 배포 전에도 실행합니다. 상세 질문과 기대 근거는 question-audit.json에 보관합니다.','','## 이번 수정','','- 등록 복합어의 띄어쓰기와 목록·일상 표현을 검색과 발췌에 동일하게 적용','- 신고 위반의 벌칙은 신고 의무 조문을 실제 인용한 항목으로 한정','- 백신 미접종의 감액 표현과 법률 제48조제3항·제4항 연결','- 질병 없는 재입식 질문의 기준 혼합 방지','- 연결되지 않는 일부 명사를 생략하고 다른 조문을 답으로 제시하는 동작 방지','','## 범위와 한계','',...report.limitations.map(s=>'- '+s),''].join('\n'));
 console.log(JSON.stringify({total:report.total,passed:report.passed,categories:report.categories,failures:report.cases.filter(c=>!c.pass)},null,2));if(report.passed!==report.total)process.exitCode=1;
}
