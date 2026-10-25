import {normalizeQuestion,unmappedNouns} from './question.js?v=20261025-3';
import {classificationRequest,classificationSources} from './classification.js?v=20261025-3';
// Browser and Node share this deterministic, model-free search implementation.
import {activeArticles,searchableChunk} from './provisions.js?v=20261025-3';
import {legalUnits} from './evidence.js?v=20261025-3';
import {actualAnnexes,annexReferences} from './annexes.js?v=20261025-3';
import {retrieve,concepts} from './retrieval.js?v=20261025-3';
const compact=s=>s.replace(/[\s“”"「」『』·ㆍ]/gu,'').replace(/[?？.]+$/u,'');
const normalize=s=>s.replace(/\s+/gu,' ').trim();
const stop=new Set(['구제역','FMD','ASF','HPAI','가축','경우','발생','규정','관련','대한','대하여','어떻게','무엇','언제','어디','해야','하나요','되나요','알려','주세요','합니까','인가요','방법','종류','분류','목록','리스트','유형','구분','항목','알려주세요','알려줘','설명해주세요','보여주세요','말해주세요']);
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
 const excluded=/야생|철새|전통시장|동물원|면제|예외|과태료|처벌|안하면|하지않|보상|살처분|위생관리업|입식|수입|고용|입국|출국|서식|별지|별표/u.test(q);
 if(!excluded&&q.includes('신고')&&!q.includes('이동제한')&&/어디|누구에게|어느기관|신고처|신고기관|방법|절차|어떻게|무슨내용|신고사항/u.test(q)&&(disease||/가축|의심축|^신고/u.test(q)))return 'reporting';
 if(!disease||excluded||q.includes('신고'))return null;
 if(q.includes('이동제한')&&!q.includes('소독')&&/해제|언제|풀리|풀어|며칠/u.test(q))return 'movement_release';
 if(q.includes('소독')&&q.includes('농장')&&!/이동제한|희석|농도|배율|소독약|몇배|차량|거점|통제초소/u.test(q))return 'farm_disinfection';
 return null;
}
const messages={classification:'질문한 대상의 분류·목록을 원문에서 확인했습니다. 가축전염병은 법률에 열거된 질병과 시행규칙의 추가 지정 목록을 함께 제시합니다.',definition:'질문한 용어의 정의 항목을 찾았습니다. 위임 규정과 적용 범위는 원문에서 함께 확인하세요.',
 ranked:'질문 속 용어와 연결된 조문을 검색했습니다. 법적 판단이나 답변 확정이 아니며, 발췌한 항·호의 적용 조건과 전체 원문을 확인하세요.',
 material:'사료의 오염물건 처리와 이동·공급 관련 근거입니다. 질병을 선택하면 해당 고시를 먼저 표시합니다. 발생농장·방역지역 및 예외 조건을 구분해 확인하세요. 등록된 법령·고시에서 찾은 결과이며 SOP 전체 절차를 대신하지 않습니다.',
 topic:'살처분 명령과 대상에 관한 조문입니다. 질병을 선택하면 해당 질병의 세부 기준을 함께 표시합니다. 예외와 적용 조건은 전체 조문에서 확인하세요.',
 article:'제목 또는 번호가 일치하는 조문입니다. 여러 쪽에 걸친 조문은 이어 표시합니다.',
 procedure:'관련 조문과 SOP 절차를 찾았습니다. 백신접종·미접종 유형과 원문의 적용 조건을 구분해 확인하세요.',
 zone:'‘방역대’를 방역지역에 관한 질문으로 연결했습니다. 지역의 정의와 설정 관련 조문을 제시합니다. 거리뿐 아니라 조정 조건과 발생 상황도 확인하세요.',
 annex:'번호·제목으로 찾은 별표·별지입니다. 표·그림·작성란의 배치는 PDF 원문으로 확인하세요.',
 related:'관련 단어가 포함된 원문 후보입니다. 질문에 대한 확정적인 답변은 아니며 해당 PDF의 전후 맥락을 확인하세요.'};
export function search(corpus,question,filters,catalog=corpus.map(c=>c.doc)){
 const query=normalizeQuestion(question),canonicalQuery=/사람|인체|인간|식물/u.test(query)?query:query.replace(/법정\s*가축\s*전염병|가축\s*법정\s*전염병|법정\s*전염병/gu,'가축전염병'),q=compact(canonicalQuery),term=definitionTerm(canonicalQuery);
 const named=[['구제역',/구제역|\bFMD\b/iu],['ASF',/아프리카\s*돼지\s*열병|\bASF\b/iu],['고병원성AI',/조류\s*인플루엔자|조류독감|고병원성\s*AI|\bHPAI\b|\bAI\b/iu]].filter(([,pattern])=>pattern.test(query)).map(([d])=>d);
 if(named.length>1)return {mode:'related',results:[],message:'서로 다른 질병의 기준을 합쳐 제시하지 않습니다. 질병별로 나누어 검색해주세요.'};
 const target=named[0]||(['구제역','ASF','고병원성AI'].includes(filters.disease)?filters.disease:null);
 if(named.length&&!['전체','공통',target].includes(filters.disease))return {mode:'related',results:[],message:'질문과 선택한 질병이 다릅니다. 검색 범위를 확인하세요.'};
 const entries=corpus.filter(({doc})=>eligible(doc,filters)&&(!target||doc.disease==='공통'||doc.disease===target)).sort((a,b)=>(priorities[a.doc.type]??9)-(priorities[b.doc.type]??9));
 if(!target&&/방역지역|방역구역|방역대(?!책|본부)|이동제한.*(?:해제|풀리)|재입식|다시(?:키우|키워|사육)/u.test(q))return {mode:'related',results:[],message:'질병별 적용 기준이 다릅니다. 질문에 질병명을 넣거나 질병을 선택해주세요.'};
 let results=[],mode='related',diagnostics;
 const add=(doc,part,extra={})=>results.push({documentId:doc.id,title:doc.title,docType:doc.type,disease:doc.disease,version:doc.version,
  from:doc.from,pdf:doc.pdf,dateNote:doc.date_note||'',...part,kind:part.kind||'body',...extra});
 const articles=(titles)=>{
  for(const {doc,index} of entries){if(doc.type==='SOP')continue;
   for(const a of activeArticles({doc,index},filters.asOf))if(titles.includes(compact(a.title)))for(const part of a.parts)add(doc,part,{match:'조문 일치'});
  }
 };
 const classification=classificationRequest(query);
 const annexKind=/별지|서식/u.test(query)?'form':query.includes('별표')?'table':null;
 const directTitle=q.replace(/(?:알려주세요|설명해주세요|알려줘|무엇인가요|무엇입니까|어떻게되나요)$/u,'').replace(/[을를은는]$/u,'');
 const directRequest=/제\d+조/u.test(q)||catalog.some(d=>(d.article_titles||[]).some(t=>compact(t)===directTitle));
 const intent=directRequest?null:procedureIntent(canonicalQuery,target);
 if(annexKind){
  mode='annex';const number=query.match(/(?:별지|별표|제)\s*(?:제\s*)?(\d+)\s*호?(?:\s*의\s*(\d+))?/u);
  const terms=words(query.replace(/별지|별표|서식|제\d+호(?:의\d+)?|알려주세요|찾아주세요|보여주세요/gu,' '));
  const namedOwners=entries.filter(e=>q.includes(compact(e.doc.title)));
  for(const {doc,index} of (namedOwners.length?namedOwners:entries))for(const a of actualAnnexes(index)){
   if(/시행령/u.test(query)&&doc.type!=='시행령'||/시행규칙/u.test(query)&&doc.type!=='시행규칙')continue;
   if(a.kind!==annexKind||number&&(a.number[0]!==number[1]||(a.number[1]||null)!==(number[2]||null)))continue;
   if(!number&&terms.length&&!terms.some(t=>a.heading.includes(t)))continue;
   add(doc,a.part,{kind:a.kind,endPage:a.endPage,deleted:a.deleted,match:'자료 번호·제목 일치'});
  }
  results.sort((a,b)=>Number(a.deleted)-Number(b.deleted));results=results.slice(0,6);
 }else if(classification&&!directRequest){
  mode='classification';const sources=classificationSources(entries,classification,filters.asOf);
  for(const hit of sources)for(const part of hit.parts)add(hit.entry.doc,{...part,heading:hit.article.number+'('+hit.article.title+')'},{match:'대상 정의·분류 일치',classificationFocus:hit.focus});
  diagnostics={status:results.length?'classification':entries.length?'unresolved_subject':'no_documents',terms:[classification.subject],subject:classification.subject,purpose:classification.purpose,grade:classification.grade,grades:classification.grades||[],alias:classification.alias};
 }else if(term){
  mode='definition';
  for(const entry of entries)for(const a of activeArticles(entry,filters.asOf).filter(a=>a.title==='정의')){
   const escaped=term.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
   const pattern=new RegExp('^\\s*\\d+\\.\\s*[“"「『]'+escaped+'[”"」』]\\s*(?:이란|란|이라\\s*함은|라\\s*함은)','u');
   for(const u of legalUnits(a).units)if(u.item&&pattern.test(u.parts.map(p=>p.text).join('\n')))for(const p of u.parts)add(entry.doc,{...p,heading:'정의 · '+term,continued:p!==u.parts[0]},{match:'정의 항목 일치'});
  }
 }else if(filters.type!=='SOP'&&target&&/방역지역|방역구역|방역대(?!책|본부)/u.test(q)&&/설정|정하|정해|나누|구분|반경|범위/u.test(q)&&!/해제|과태료|예외|소독/u.test(q)){
  mode='zone';for(const {doc,index} of entries){if(doc.type==='SOP'||doc.disease!==target)continue;
   for(const term of ['방역지역','관리지역','보호지역','예찰지역'])for(const d of index.definitions)if(d.term===term)for(const p of d.parts||[d.part])add(doc,p,{match:'방역지역 정의 연결'});
  }
  articles(['시장군수구청장의조치','시장군수의조치']);
 }else if(entries.some(e=>e.doc.type!=='SOP')&&/^(?:(?:구제역|FMD|ASF|아프리카돼지열병|고병원성AI|HPAI|AI|조류인플루엔자|조류독감)(?:이발생하면|발생시|의|은|는)?)?살처분(?:(?:의)?(?:명령|대상|기준|범위|요건|조치|절차|방법))?(?:은|는|을|를)?(?:(?:어떻게|언제|누가)?(?:하나요|합니까|되나요|해야하나요|하죠)|알려주세요|알려줘)?$/iu.test(q)){
  mode='topic';
  articles(['살처분명령','살처분명령등','살처분등조치','살처분등']);
  // Without a disease selection, show the common legal basis first.
  // Disease-specific rules retain their separate source and scenario.
  results=results.map(r=>({...r,topicPrimary:target?r.disease===target:r.docType==='법률'}));
 }else if(entries.some(e=>e.doc.type!=='SOP')&&q.includes('사료')&&!/수입|수출|검역|보상|벌칙|과태료|판매|신고|재활용|제조업|제\d+조/u.test(q)&&(/발생|전염병|조치|처리|폐기|소각|매몰|공급|운반|반출|반입|이동|소독|보관|방역|남은/u.test(q)||q==='사료')){
  mode='material';
  const transport=/공급|운반|반출|반입|이동|차량/u.test(q),disposal=/처리|폐기|소각|매몰|오염|남은/u.test(q);
  for(const entry of entries){const {doc}=entry;if(doc.type==='SOP')continue;
   for(const a of activeArticles(entry,filters.asOf)){
    let scopes=[],primary=false;
    if(doc.type==='법률'&&a.number==='제23조'){scopes=[{paragraph:1,item:null},{paragraph:2,item:null}];primary=!target&&!transport;}
    else if(doc.type==='법률'&&a.number==='제19조'){scopes=[{paragraph:1,item:1}];primary=!target&&transport;}
    else if(doc.type==='시행규칙'&&a.number==='제22조의3'){scopes=[{paragraph:null,item:1}];primary=!target;}
    else if(doc.type==='고시'&&(/소독.*조치/u.test(a.title)||/지역.*방역/u.test(a.title))){
     const isDisposal=/소독.*조치/u.test(a.title);
     if(transport&&!disposal&&isDisposal||disposal&&!transport&&!isDisposal)continue;
     const units=legalUnits(a).units;
     for(const parent of units.filter(u=>!u.item)){
      const children=units.filter(u=>u.item&&u.paragraph===parent.paragraph);
      const selected=children.length?children.filter(u=>/사\s*료/u.test(u.parts.map(p=>p.text).join(''))):/사\s*료/u.test(parent.parts.map(p=>p.text).join(''))?[parent]:[];
      scopes.push(...selected.map(u=>({paragraph:u.paragraph,item:u.item})));
     }
     primary=Boolean(target)&&(transport&&!disposal?!isDisposal:isDisposal);
    }
    if(!scopes.length)continue;
    for(const part of a.parts)add(doc,part,{match:'사료 조치 연결',materialScopes:scopes,materialPrimary:primary});
   }
  }
 }else if(intent){
  mode='procedure';const titles={reporting:['죽거나병든가축의신고'],movement_release:target==='ASF'?['방역지역전환및해제']:target==='고병원성AI'?['관리지역보호지역의방역','예찰지역의방역']:['이동제한해제등'],farm_disinfection:['소독등조치']}[intent];articles(titles);
  if(intent==='reporting'&&target)for(const entry of entries.filter(e=>e.doc.type==='고시'&&e.doc.disease===target))for(const a of activeArticles(entry,filters.asOf))if(compact(a.title)==='의심축발생시조치')for(const part of a.parts)add(entry.doc,part,{match:'신고 관련 고시'});
  if(target)for(const {doc,index} of entries)if(doc.type==='SOP'&&doc.disease===target)for(const p of index.procedures)if(p.intent===intent)for(const part of p.parts)add(doc,part,{match:'SOP 절차 연결'});
 }else{
  let topic=q.replace(/(?:알려주세요|설명해주세요|알려줘|무엇인가요|무엇입니까|어떻게되나요)$/u,'').replace(/[을를은는]$/u,'');
  const requested=q.match(/제\d+조(?:의\d+)?(?:제\d+항)?(?:제\d+호)?/u);
  const number=requested?.[0].match(/^제\d+조(?:의\d+)?/u)?.[0]||null;
  const requestedType=/시행규칙/u.test(q)?'시행규칙':/시행령/u.test(q)?'시행령':/예방법|^법제/u.test(q)?'법률':null;
  const benefitQuestion=!number&&/생계안정|소득안정/u.test(q);
  for(const entry of entries){const {doc,index}=entry;if(benefitQuestion||doc.type==='SOP'||requestedType&&doc.type!==requestedType)continue;for(const a of activeArticles(entry,filters.asOf))if(number?a.number===number:compact(a.title)===topic)for(const part of a.parts)add(doc,part,{match:'조문 일치'});}
  const knownTopic=!benefitQuestion&&filters.type!=='SOP'&&catalog.some(d=>(d.article_titles||[]).some(t=>compact(t)===topic));
  if(results.length||number||knownTopic)mode='article';else{
   const found=retrieve(entries,canonicalQuery,filters.asOf,target);
   if(found.hits.length){
    mode='ranked';
    for(const hit of found.hits)for(const part of hit.article.parts)add(hit.doc,part,{
     match:'질문어·조문 연결',retrievalScopes:hit.scopes,retrievalScore:hit.score,matchedTerms:hit.matched,
     retrievalPrimary:!found.needsDetail&&(found.actors?.includes('축산계열화사업자')?hit.actorRoot||hit.roleDelegated&&hit.doc.type==='시행규칙':found.hits.indexOf(hit)<3)&&(found.roleSearch||!target||hit.doc.disease===target||!found.hits.some(h=>h.doc.disease===target))});
   }
   if(found.sopHits.length){
    mode='ranked';
    for(const hit of found.sopHits)for(const part of hit.section.parts)add(hit.doc,part,{
     heading:hit.section.heading,scenario:hit.section.scenario,match:'SOP 절·항목 검색',
     kind:hit.section.layout||'body',sopKey:hit.section.key,sopFocus:hit.units,retrievalPrimary:!found.needsDetail&&hit.section.layout!=='table'&&hit.primary&&found.sopHits.indexOf(hit)<3,
     matchedTerms:found.anchors});
   }
   for(const hit of found.supplement)add(hit.doc,hit.part,{match:'SOP 관련 후보',retrievalPrimary:false,matchedTerms:found.anchors});
   if(!results.length&&!found.anchors.length){
    const terms=words(query).filter(t=>!['조치','발생시','발생하면','전염병','처리','기준'].includes(t));
    for(const entry of entries)for(const part of entry.index.chunks){
     if(!terms.length||!searchableChunk(entry,part,filters.asOf)||!terms.every(t=>compact(part.text).includes(compact(t))))continue;
     add(entry.doc,part,{match:'관련 단어 일치',score:terms.length});
    }
    results=results.slice(0,6);
   }
   // Keep diagnostics separate from the existence of a rule.
   diagnostics={status:entries.length?found.status:'no_documents',terms:found.anchors,benefits:found.benefits||[],roleSearch:found.roleSearch||false,actors:found.actors||[],articleCandidates:found.hits.length,sopCandidates:found.sopHits.length};

  }
 }
 // Financial compensation is anchored in decree 11(1), which explicitly
 // delegates payment/reduction criteria to annex 2. Delayed-order reductions
 // in 14-2 do not replace that primary source.
 if(!annexKind&&!term&&!directRequest&&/보상/u.test(q)&&(results.length||/최초(?:로)?신고|처음(?:으로)?신고/u.test(q)||!diagnostics?.terms?.some(t=>!['보상','감액','지원','예방접종','살처분','명령','위반','경감','신고','최저지급'].includes(t)))){
  const decree=entries.find(e=>e.doc.type==='시행령');
  const article=decree&&activeArticles(decree,filters.asOf).find(a=>a.number==='제11조');
  const law=entries.find(e=>e.doc.type==='법률'),basis=law&&activeArticles(law,filters.asOf).find(a=>a.number==='제48조');
  if(article||basis){
   mode='ranked';if(diagnostics){diagnostics.financialBasis=true;if(diagnostics.status==='no_match')diagnostics.status='linked_basis';}results=results.filter(r=>!(article&&r.documentId===decree.doc.id&&r.heading?.startsWith('제11조(')));
   for(const row of results)if(row.docType==='SOP')row.retrievalPrimary=false;
   if(basis){
    results=results.filter(r=>!(r.documentId===law.doc.id&&r.heading?.startsWith('제48조(')));
    const reduction=/감액|삭감|줄어|깎|미접종|맞히지않|맞추지않|접종하지|접종안|안맞|위반|불이행|거부/u.test(q);
    const relief=/경감|완화|최초(?:로)?신고|처음(?:으로)?신고/u.test(q);
    const scopes=relief?[{paragraph:4,item:null}]:reduction?[{paragraph:3,item:/백신|예방접종|미접종/u.test(q)?2:null},{paragraph:4,item:null}]:[{paragraph:1,item:q.includes('살처분')?3:null}];
    for(const part of basis.parts)add(law.doc,part,{match:'보상금 법률 근거 연결',retrievalPrimary:true,retrievalScopes:scopes});
   }
   const parts=article?legalUnits(article).units.find(u=>u.paragraph===1&&!u.item)?.parts||[]:[];
   for(const p of parts)add(decree.doc,{...p,heading:'제11조('+article.title+')'},{match:'보상금 지급·감액 기준 연결',retrievalPrimary:true,retrievalScopes:[{paragraph:1,item:null}]});
   results.sort((a,b)=>Number(b.match==='보상금 지급·감액 기준 연결')-Number(a.match==='보상금 지급·감액 기준 연결'));
  }
 }
 // Follow explicit annex citations in the retrieved source, never a guessed
 // table number or an appendix-list page. Keep document/date filters binding.
 if(mode==='ranked'&&/보상|생계안정|소득안정/u.test(q)){
  const related=[];
  for(const row of results){
   if(row.docType==='SOP'||['table','form'].includes(row.kind))continue;
   const source=entries.find(e=>e.doc.id===row.documentId);
   for(const ref of annexReferences(row.text,source.doc,entries)){
    const e=entries.find(e=>e.doc.id===ref.documentId),a=actualAnnexes(e.index).find(a=>a.kind===ref.annexKind&&a.number.join(':')===ref.number.join(':'));
    if(a)related.push([e.doc,a,row.retrievalPrimary!==false]);
   }
  }
  related.sort((a,b)=>Number(b[2])-Number(a[2]));
  for(const [doc,a,primary] of related)add(doc,a.part,{kind:a.kind,endPage:a.endPage,deleted:a.deleted,match:'조문 인용 별표·서식 연결',retrievalPrimary:primary});
 }
 const unmapped=unmappedNouns(corpus,query,concepts.flatMap(c=>c.aliases));
 if(unmapped.length&&results.length)return {mode:'related',results:[],diagnostics:{status:'unmapped_subject',terms:[],unmapped},message:'다음 표현을 등록 원문과 연결하지 못했습니다: '+unmapped.join(', ')+'. 대상이나 조건을 확인해주세요. 이 표현을 생략한 다른 근거를 답으로 제시하지 않습니다.'};
 const seen=new Set();results=results.filter(r=>{const k=r.documentId+':'+r.page+':'+compact(r.text);if(seen.has(k))return false;seen.add(k);return true;});
 return {mode,results,diagnostics:diagnostics||{status:results.length?'structured':'no_match',terms:[]},asOf:filters.asOf,message:diagnostics?.status==='unresolved_subject'?'질문의 분류 대상을 선택한 등록 원문에서 확인하지 못했습니다. 대상명·문서 종류·기준일을 확인해주세요. 다른 주제의 조문으로 대신 제시하지 않습니다.':diagnostics?.status==='no_documents'?'선택한 문서 종류·질병·기준일에 적용되는 등록 문서가 없습니다. 과거 버전의 미등록과 규정 부존재는 다릅니다.':results.length?(diagnostics?.status==='needs_detail'?'약품·제품과 희석 조건을 특정하지 못했습니다. 일반 소독 조문을 희석배율의 답으로 제시하지 않습니다. 관련 후보의 원문과 제품 기준을 확인하세요.':diagnostics?.purpose==='culling-diseases'?'살처분 대상 질병을 정한 시행규칙의 제1종·제2종 목록과 추가 지정 조건을 함께 제시합니다. 법률의 명령 요건과 제2종 준용 범위도 원문에서 확인하세요.':mode==='classification'&&diagnostics?.subject!=='가축전염병'?'질문한 대상의 분류·목록을 원문에서 확인했습니다. 포함 범위와 위임 사항은 전체 조문에서 함께 확인하세요.':messages[mode]):term?`‘${term}’의 완결된 정의를 선택 조건에서 찾지 못했습니다. 다른 조문을 정의로 대신 제시하지 않습니다.`:diagnostics?.status==='no_terms'?'질문에서 등록 문서의 검색 용어를 연결하지 못했습니다. 대상이나 조치를 구체적으로 입력해주세요. 규정이 없다는 뜻은 아닙니다.':'선택 조건에서 근거를 찾지 못했습니다. 문서 종류·기준일을 확인하거나 질문 표현을 바꿔주세요. 검색 실패가 규정 부존재를 뜻하지는 않습니다.'};
}
