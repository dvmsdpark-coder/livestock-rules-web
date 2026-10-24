import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {search} from '../site/assets/search.js';
import {presentResults} from '../site/assets/evidence.js';
import {activeArticles} from '../site/assets/provisions.js';
const root=new URL('../',import.meta.url),site=new URL('site/',root);
export const manifest=JSON.parse(fs.readFileSync(new URL('data/manifest.json',site)));
export const corpus=manifest.documents.map(doc=>({doc,index:JSON.parse(fs.readFileSync(new URL(doc.data,site))),asOf:'2026-10-24'}));
export const defaults={asOf:'2026-10-24',disease:'전체',type:'전체'};
export const fixtures=JSON.parse(fs.readFileSync(new URL('tests/fixtures/questions.json',root)));
export function evaluate(){
 const natural=fixtures.map(f=>{
  const result=search(corpus,f.question,{...defaults,...f.filters}),view=presentResults(corpus,result,f.question);
  const found=view.groups.filter(g=>g.articleNumber),expected=g=>g.docType===f.expected.type&&g.disease===f.expected.disease&&g.articleNumber===f.expected.article;
  return {id:f.id,question:f.question,expected:f.expected,mode:result.mode,terms:result.diagnostics?.terms||[],hitInSix:found.slice(0,6).some(expected),visibleHit:found.some(g=>g.primary&&expected(g)),top:found.slice(0,6).map(g=>({type:g.docType,disease:g.disease,article:g.articleNumber,primary:g.primary}))};
 });
 const structural=[];
 for(const e of corpus.filter(e=>e.doc.type!=='SOP'))for(const a of activeArticles(e,defaults.asOf)){
  for(const kind of ['number','title']){
   const question=kind==='number'?a.number:a.title+'을 알려주세요';
   const r=search(corpus,question,{...defaults,type:e.doc.type,disease:e.doc.disease});
   structural.push({document:e.doc.id,article:a.number,kind,pass:r.results.some(p=>p.documentId===e.doc.id&&(p.heading||'').replace(/\s/gu,'').startsWith(a.number+'('))});
  }
 }
 return {schema:1,asOf:defaults.asOf,sourceDocuments:corpus.length,sourceSnapshot:corpus.map(e=>({id:e.doc.id,sha256:e.doc.sha256,dataSha256:e.doc.data_sha256,activeArticles:activeArticles(e,defaults.asOf).length,chunks:e.index.chunks.length})),
  natural:{total:natural.length,hitInSix:natural.filter(r=>r.hitInSix).length,visibleHit:natural.filter(r=>r.visibleHit).length,cases:natural},
  structural:{total:structural.length,passed:structural.filter(r=>r.pass).length,failed:structural.filter(r=>!r.pass)},
  limitations:['조문 번호·제목 자동 점검은 자연어 이해 정확도를 뜻하지 않습니다.','예시 질문의 기대 조문 도달 여부만 평가하며 법률 해석·완전성을 보증하지 않습니다.','SOP의 미검토 표·그림과 전체 절차의 의미 정확도는 별도 검토가 필요합니다.']};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const result=evaluate();fs.mkdirSync(new URL('docs/',root),{recursive:true});
 fs.writeFileSync(new URL('docs/search-evaluation.json',root),JSON.stringify(result,null,2)+'\n');
 fs.writeFileSync(new URL('docs/SEARCH_EVALUATION.md',root),[
 '# 검색 자동 평가',
 '',
 '기준일: '+result.asOf+' · 등록 문서 '+result.sourceDocuments+'종',
 '',
 '| 검사 | 결과 | 의미 |',
 '| --- | --- | --- |',
 '| 대표 자연어 질문 | '+result.natural.hitInSix+'/'+result.natural.total+' | 기대 조문이 상위 6개 조문 안에 존재 |',
 '| 대표 자연어 질문의 기본 표시 | '+result.natural.visibleHit+'/'+result.natural.total+' | 기대 조문이 접힌 추가 근거 밖에 표시됨 |',
 '| 조문 번호·제목 도달성 | '+result.structural.passed+'/'+result.structural.total+' | 현행 법령·고시에서 자동 생성한 구조 검사 |',
 '',
 '기본 표시와 상위 6개 지표는 다릅니다. 신고 질문의 공통 법률 등은 SOP 절차보다 뒤의 추가 근거에 표시될 수 있습니다.',
 '',
 '## 시험 범위',
 '',
 '신고, 살처분, 사료, 분뇨, 재입식, 보상금, 생계지원, 축산차량 등록·교육, 출입기록, 역학조사, 사체, 매몰지, 수입금지, 검역증명서, 예방접종, 정의·범위, 소독, 방역지역, 이동제한 해제.',
 '',
 '## 재실행',
 '',
 'npm test 실행 후 npm run evaluate를 실행합니다. GitHub Actions에서도 시험과 평가를 통과해야 배포됩니다. 세부 질문, 기대 조문, 순위와 문서 해시는 search-evaluation.json에 기록합니다.',
 '',
 '## 해석상 한계',
 '',
 ...result.limitations.map(t=>'- '+t),
 '- 31개 예시에서의 도달성은 임의의 실제 질문에 대한 정답률이 아닙니다. 표본을 확장하고 전문가 검토를 이어가야 합니다.',
 '- 전문가가 확정한 법률 해석·정답 데이터로 검증한 결과는 아닙니다.',
 ''
 ].join('\n'));
 console.log(JSON.stringify({natural:{total:result.natural.total,hitInSix:result.natural.hitInSix,visibleHit:result.natural.visibleHit},structural:{total:result.structural.total,passed:result.structural.passed},failures:result.natural.cases.filter(c=>!c.hitInSix),structuralFailures:result.structural.failed},null,2));
 if(result.natural.hitInSix!==result.natural.total||result.structural.passed!==result.structural.total)process.exitCode=1;
}
