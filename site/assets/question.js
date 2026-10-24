// Normalize only registered compound terms; keep the user's original query for display.
// Whitespace normalization is not a synonym for unrelated subjects or conditions.
const compounds=['축산계열화사업자','계열화사업자','가축방역관','가축방역사','방역관리책임자','국립가축방역기관','가축전염병','법정전염병','예방접종','이동제한','방역지역','방역대','관리지역','보호지역','예찰지역','축산차량','시설출입차량','출입기록','생계안정','소득안정','역학조사','야생조류','발생농장','재입식'];
export function normalizeQuestion(question){
 let q=question.normalize('NFC').replace(/\s+/gu,' ').trim().replace(/^안녕하세요[.!。]?\s*/u,'').replace(/(?:\s*알려\s*주세요){2,}$/u,' 알려주세요');
 for(const word of compounds.sort((a,b)=>b.length-a.length))q=q.replace(new RegExp([...word].join('\\s*'),'gu'),word);
 q=q.replace(/축산\s*계열화\s*사업자|(?<!축산)계열화사업자|계열사/gu,'축산계열화사업자');
 // Contact is reporting only in an explicit disease/animal discovery context.
 if(/의심|발견/u.test(q)&&/구제역|ASF|HPAI|AI|가축|돼지|소를|닭/u.test(q)&&/어디|누구|어느/u.test(q))q=q.replace(/연락/gu,'신고');
 q=q.replace(/먹이/gu,'사료').replace(/방역\s*구역/gu,'방역지역');
 return q;
}

const vocabularyCache=new WeakMap();
const conversational=/^(?:최초|처음|안녕|알려|설명|보여|부탁|궁금|어떻|어떤|무슨|무엇|어디|누구|언제|얼마|몇|며칠|가능|필요|어느|해야|되나|하나|있나|없나|받나|맞히|맞추|줄어|깎|다시|관련|대한|대해|경우|근거|조건|기준|종류|분류|목록|리스트|유형|가축전염병|법정전염병|법정가축전염병|가축법정전염병)/u;
export function unmappedNouns(corpus,question,aliases=[]){
 let body=vocabularyCache.get(corpus);if(!body){body=corpus.flatMap(e=>e.index.pages.map(p=>p.text)).join(' ').replace(/\s/gu,'').toLowerCase();vocabularyCache.set(corpus,body);}
 return [...new Set((question.match(/[가-힣A-Za-z]+/gu)||[]).filter(token=>{
  if(conversational.test(token)||aliases.some(alias=>token.includes(alias))||/[요죠다까줘면고며을수도]$/u.test(token)||/^(?:FMD|ASF|HPAI|AI)$/iu.test(token))return false;
  const stem=token.replace(/(?:에서는|에게는|으로는|에서|에게|으로|에는|까지|부터|이라|이란|한|의|은|는|이|가|을|를|와|과)$/u,'');
  return stem.length>=2&&!body.includes(stem.toLowerCase())&&!/^(?:생계|소득)안정(?:자금|지원금|지원비)/u.test(stem);
 }))];
}

// Payment floor is distinct from reduction grounds and relief from reductions.
export function compensationFloorRequest(question){
 const q=question.replace(/\s/gu,'');
 return /보상|별표2/u.test(q)&&/최소|최저|하한|20(?:%|퍼센트)|100분의20|이십(?:프로|퍼센트)/u.test(q);
}
