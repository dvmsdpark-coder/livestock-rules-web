// Browser and Node share this deterministic, model-free search implementation.
import {activeArticles,searchableChunk} from './provisions.js?v=20261024-3';
import {legalUnits} from './evidence.js?v=20261024-3';
const compact=s=>s.replace(/[\s“”"「」『』·ㆍ]/gu,'').replace(/[?？.]+$/u,'');
const normalize=s=>s.replace(/\s+/gu,' ').trim();
const stop=new Set(['구제역','FMD','ASF','HPAI','가축','경우','발생','규정','관련','대한','대하여','어떻게','무엇','언제','어디','해야','하나요','되나요','알려','주세요','합니까','인가요','방법']);
const priorities={'법률':0,'시행령':1,'시행규칙':2,'고시':3,'SOP':4};
export function eligible(doc,filters){
 return doc.from<=filters.asOf&&(!doc.to||filters.asOf<doc.to)
  &&(filters.disease==='전체'||doc.disease===filters.disease||doc.disease==='공통')
  &&(filters.type==='전체'||doc.type===filters.type);
}
function definitionTerm(question){
 const q=normalize(question).replace(/[“”"「」『』?？.]/gu,'');
 for(const re of [/^(.{1,60}?)\s*의\s*정의(?:는|를)?(?:\s*(?:무엇인가요|무엇입니까|알려\s*주세요|설명해\s*주세요))?$/u,/^(.{1,60}?)\s+정의$/u,/^(.{1,60}?)(?:이란|란)(?:\s*무엇(?:인가요|입니까)?)?$/u]){
  const m=q.match(re);if(m)return m[1].trim();
 }return null;
}
function words(question){
 const results=[];
 for(let word of question.match(/[가-힣A-Za-z0-9]{2,}/gu)||[]){
  word=word.replace(/(?:해야하죠|해야하나요|되나요|하나요|인가요|입니까|에서는|에게는|으로|에서|에게|은|는|을|를|이|가|의|와|과)$/u,'');
  if(word.length>=2&&!stop.has(word)&&!results.includes(word))results.push(word);
 }
 for(const root of ['이동제한','해제','소독','신고','방역지역','백신','임상검사','살처분','재입식','보호지역','관리지역','예찰지역']){
  if(question.includes(root)&&!results.includes(root))results.push(root);
 }
 return results.slice(0,12);
}
function procedureIntent(question,disease){
 const q=compact(question);
 const excluded=/면제|예외|과태료|처벌|안하면|하지않|보상|살처분|위생관리업|입식|수입|고용|입국|출국|서식|별지|별표/u.test(q);
 if(!excluded&&q.includes('신고')&&!q.includes('이동제한')&&/어디|누구에게|어느기관|신고처|신고기관/u.test(q)&&(disease||/가축|의심축/u.test(q)))return 'reporting';
 if(!disease||excluded||q.includes('신고'))return null;
 if(q.includes('이동제한')&&!q.includes('소독')&&/해제|언제|풀리|풀어|며칠/u.test(q))return 'movement_release';
 if(q.includes('소독')&&q.includes('농장')&&!/이동제한|희석|농도|배율|소독약|몇배|차량|거점|통제초소/u.test(q))return 'farm_disinfection';
 return null;
}
const messages={definition:'질문한 용어의 정의 항목을 찾았습니다. 위임 규정과 적용 범위는 원문에서 함께 확인하세요.',
 topic:'살처분 명령과 대상에 관한 조문입니다. 질병을 선택하면 해당 질병의 세부 기준을 함께 표시합니다. 예외와 적용 조건은 전체 조문에서 확인하세요.',
 article:'제목 또는 번호가 일치하는 조문입니다. 여러 쪽에 걸친 조문은 이어 표시합니다.',
 procedure:'관련 조문과 SOP 절차를 찾았습니다. 백신접종·미접종 유형과 원문의 적용 조건을 구분해 확인하세요.',
 zone:'‘방역대’를 방역지역에 관한 질문으로 연결했습니다. 지역의 정의와 설정 관련 조문을 제시합니다. 거리뿐 아니라 조정 조건과 발생 상황도 확인하세요.',
 annex:'번호·제목으로 찾은 별표·별지입니다. 표·그림·작성란의 배치는 PDF 원문으로 확인하세요.',
 related:'관련 단어가 포함된 원문 후보입니다. 질문에 대한 확정적인 답변은 아니며 해당 PDF의 전후 맥락을 확인하세요.'};
export function search(corpus,question,filters,catalog=corpus.map(c=>c.doc)){
 const query=normalize(question),q=compact(query),term=definitionTerm(query);
 const named=[['구제역',/구제역|\bFMD\b/iu],['ASF',/아프리카\s*돼지\s*열병|\bASF\b/iu],['고병원성AI',/조류\s*인플루엔자|조류독감|\bHPAI\b|\bAI\b/iu]].filter(([,pattern])=>pattern.test(query)).map(([d])=>d);
 if(named.length>1)return {mode:'related',results:[],message:'서로 다른 질병의 기준을 합쳐 제시하지 않습니다. 질병별로 나누어 검색해주세요.'};
 const target=named[0]||(['구제역','ASF','고병원성AI'].includes(filters.disease)?filters.disease:null);
 if(named.length&&!['전체','공통',target].includes(filters.disease))return {mode:'related',results:[],message:'질문과 선택한 질병이 다릅니다. 검색 범위를 확인하세요.'};
 const entries=corpus.filter(({doc})=>eligible(doc,filters)&&(!target||doc.disease==='공통'||doc.disease===target)).sort((a,b)=>(priorities[a.doc.type]??9)-(priorities[b.doc.type]??9));
 if(!target&&/방역지역|방역구역|방역대(?!책|본부)|이동제한.*(?:해제|풀리)/u.test(q))return {mode:'related',results:[],message:'질병별 적용 기준이 다릅니다. 질문에 질병명을 넣거나 질병을 선택해주세요.'};
 let results=[],mode='related';
 const add=(doc,part,extra={})=>results.push({documentId:doc.id,title:doc.title,docType:doc.type,disease:doc.disease,version:doc.version,
  from:doc.from,pdf:doc.pdf,dateNote:doc.date_note||'',...part,kind:part.kind||'body',...extra});
 const articles=(titles)=>{
  for(const {doc,index} of entries){if(doc.type==='SOP')continue;
   for(const a of activeArticles({doc,index},filters.asOf))if(titles.includes(compact(a.title)))for(const part of a.parts)add(doc,part,{match:'조문 일치'});
  }
 };
 const annexKind=/별지|서식/u.test(query)?'form':query.includes('별표')?'table':null;
 const intent=procedureIntent(query,target);
 if(annexKind){
  mode='annex';const number=query.match(/(?:별지|별표|제)\s*(?:제\s*)?(\d+)\s*호?(?:\s*의\s*(\d+))?/u);
  const terms=words(query.replace(/별지|별표|서식|제\d+호(?:의\d+)?|알려주세요|찾아주세요|보여주세요/gu,' '));
  for(const {doc,index} of entries)for(const a of index.annexes){
   if(a.kind!==annexKind||number&&(a.number[0]!==number[1]||(a.number[1]||null)!==(number[2]||null)))continue;
   if(!number&&terms.length&&!terms.some(t=>a.heading.includes(t)))continue;
   add(doc,a.part,{kind:a.kind,endPage:a.endPage,deleted:a.deleted,match:'자료 번호·제목 일치'});
  }
  results.sort((a,b)=>Number(a.deleted)-Number(b.deleted));results=results.slice(0,6);
 }else if(term){
  mode='definition';
  for(const entry of entries)for(const a of activeArticles(entry,filters.asOf).filter(a=>a.title==='정의')){
   const escaped=term.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
   const pattern=new RegExp('^\\s*\\d+\\.\\s*[“"「『]'+escaped+'[”"」』]\\s*(?:이란|란|이라\\s*함은|라\\s*함은)','u');
   for(const u of legalUnits(a).units)if(u.item&&pattern.test(u.parts.map(p=>p.text).join('\n')))for(const p of u.parts)add(entry.doc,{...p,heading:'정의 · '+term,continued:p!==u.parts[0]},{match:'정의 항목 일치'});
  }
 }else if(target&&/방역지역|방역구역|방역대(?!책|본부)/u.test(q)&&/설정|정하|정해|나누|구분|반경|범위/u.test(q)&&!/해제|과태료|예외|소독/u.test(q)){
  mode='zone';for(const {doc,index} of entries){if(doc.type==='SOP'||doc.disease!==target)continue;
   for(const term of ['방역지역','관리지역','보호지역','예찰지역'])for(const d of index.definitions)if(d.term===term)for(const p of d.parts||[d.part])add(doc,p,{match:'방역지역 정의 연결'});
  }
  articles(['시장군수구청장의조치','시장군수의조치']);
 }else if(/^(?:(?:구제역|FMD|ASF|아프리카돼지열병|고병원성AI|HPAI|AI|조류인플루엔자|조류독감)(?:이발생하면|발생시|의|은|는)?)?살처분(?:(?:의)?(?:명령|대상|기준|범위|요건|조치|절차|방법))?(?:은|는|을|를)?(?:(?:어떻게|언제|누가)?(?:하나요|합니까|되나요|해야하나요|하죠)|알려주세요|알려줘)?$/iu.test(q)){
  mode='topic';
  articles(['살처분명령','살처분명령등','살처분등조치','살처분등']);
  // Without a disease selection, show the common legal basis first.
  // Disease-specific rules retain their separate source and scenario.
  results=results.map(r=>({...r,topicPrimary:target?r.disease===target:r.docType==='법률'}));
 }else if(intent){
  mode='procedure';const titles={reporting:['죽거나병든가축의신고'],movement_release:target==='ASF'?['방역지역전환및해제']:target==='고병원성AI'?['관리지역보호지역의방역','예찰지역의방역']:['이동제한해제등'],farm_disinfection:['소독등조치']}[intent];articles(titles);
  if(target)for(const {doc,index} of entries)if(doc.type==='SOP'&&doc.disease===target)for(const p of index.procedures)if(p.intent===intent)for(const part of p.parts)add(doc,part,{match:'SOP 절차 연결'});
 }else{
  let topic=q.replace(/(?:알려주세요|설명해주세요|알려줘|무엇인가요|무엇입니까|어떻게되나요)$/u,'').replace(/[을를은는]$/u,'');
  const requested=q.match(/제\d+조(?:의\d+)?(?:제\d+항)?(?:제\d+호)?/u);
  const number=requested?.[0].match(/^제\d+조(?:의\d+)?/u)?.[0]||null;
  const requestedType=/시행규칙/u.test(q)?'시행규칙':/시행령/u.test(q)?'시행령':/예방법|^법제/u.test(q)?'법률':null;
  for(const entry of entries){const {doc,index}=entry;if(doc.type==='SOP'||requestedType&&doc.type!==requestedType)continue;for(const a of activeArticles(entry,filters.asOf))if(number?a.number===number:compact(a.title)===topic)for(const part of a.parts)add(doc,part,{match:'조문 일치'});}
  const knownTopic=catalog.some(d=>(d.article_titles||[]).some(t=>compact(t)===topic));
  if(results.length||number||knownTopic)mode='article';else{
   const terms=words(query.replace(/방역대(?!책|본부)|방역구역/gu,'방역지역'));
   for(const entry of entries)for(const part of entry.index.chunks){const {doc,index}=entry;if(!searchableChunk(entry,part,filters.asOf))continue;
    const hits=terms.filter(t=>part.text.includes(t));if(!hits.length)continue;
    const score=hits.length*3+hits.filter(t=>part.heading.includes(t)).length*2-(part.kind==='form'?6:part.kind==='table'?1:0);
    add(doc,part,{match:'관련 단어 일치',score});
   }
   results.sort((a,b)=>b.score-a.score);results=results.slice(0,6);
  }
 }
 const seen=new Set();results=results.filter(r=>{const k=r.documentId+':'+r.page+':'+compact(r.text);if(seen.has(k))return false;seen.add(k);return true;});
 return {mode,results,asOf:filters.asOf,message:results.length?messages[mode]:term?`‘${term}’의 완결된 정의를 선택 조건에서 찾지 못했습니다. 다른 조문을 정의로 대신 제시하지 않습니다.`:'선택 조건에서 근거를 찾지 못했습니다. 문서 종류·기준일을 확인하거나 질문 표현을 바꿔주세요. 검색 실패가 규정 부존재를 뜻하지는 않습니다.'};
}
