// Preserve literal subjects that the concept/title dictionaries do not cover.
// This is an evidence constraint, not a semantic synonym or inferred legal answer.
const flat=s=>s.replace(/[\s「」『』ㆍ·]/gu,'').toLocaleLowerCase();
const bodies=new WeakMap();
const generic=new Set(['ai','asf','fmd','hpai','sop','가축','가축의','가축전염병','검출','검출시','경우','것들','것','고병원성','고병원성ai','고시','공통','관련','관리','관한','구분','구제역','권한','규정','근거','기간','기준','까지','내용','농장','누구','대상','대하여','대한','대해','동안','되나요','등의','따라','따른','때','리스트','며칠','몇','목록','무슨','무엇','무엇인가요','받나요','발생','발생농장','발생시','발생하면','방법','방역','방역구역','방역대','방역조치','방역지역','범위','법','법률','부터','분류','비교','비용','사항','설명','설정','시','시행규칙','시행령','신청','실시','아프리카돼지열병','알려주세요','어느','어디','어디에','어떤','어떻게','언제','얼마','업무','없는','역할','예방법','요령','위하여','위한','유형','의무','임무','있나요','있는','자격기준','자격요건','자격조건','자금','전염병','전체','절차','정리','정의','조건','조류독감','조류인플루엔자','조문','조치','종류','준수사항','지역','지원금','지원비','직무','질병','차이','차이점','책무','처리','처음','최초','퍼센트','필요한','하나요','하여야','항목','확인']);
const ending=/(?:에서는|에게는|으로는|에대한|에관한|에서|에게|으로|에는|까지|부터|이란|이라|의|은|는|이|가|을|를|와|과|로|에)$/u;
export function isQueryNoise(s){return generic.has(s)||/^(?:하는|해야|되는|있는|없는|받을|받는)|(?:하면|되면|않으면|되거나|하여|해서|해도|당해도|했을|했을때|되었|하였|하는지)$/u.test(s);}
function trim(s){return s.replace(ending,'');}
export function literalSubjects(entries,question,aliases=[]){
 const body=entries.map(e=>{if(!bodies.has(e.index))bodies.set(e.index,flat(e.index.pages.map(p=>p.text).join(' ')));return bodies.get(e.index);}).join(' ');
 const registered=[...new Set([...aliases,'아프리카돼지열병','조류인플루엔자','조류독감','고병원성AI','구제역','FMD','ASF','HPAI'].map(flat).filter(t=>t.length>=2))].sort((a,b)=>b.length-a.length);
 const out=[];
 for(const raw of question.replace(/제\s*\d+\s*조(?:\s*의\s*\d+)?(?:\s*제\s*\d+\s*항)?(?:\s*제\s*\d+\s*호)?/gu,' ').match(/[가-힣A-Za-z]+/gu)||[]){
  if(/^(?:알려|설명해|보여|찾아|궁금|어떻|무엇|어디|누구|언제|얼마|몇|가능|필요|부탁|안녕)/u.test(raw)||/(?:나요|까요|하죠|해요|인가요|입니까|주세요|알려줘)$/u.test(raw))continue;
  let token=flat(trim(raw));if(registered.some(a=>a.includes(token)&&flat(question).includes(a)))continue;
  const hadAlias=registered.some(a=>token.includes(a));
  for(const alias of registered)token=token.split(alias).join(' ');
  for(let t of token.split(' ')){t=trim(t.replace(/(?:의)?(?:업무|역할|직무|임무|권한|의무|내용)$/u,''));if(t.length<2||isQueryNoise(t)||hadAlias&&t.length<=2)continue;
   if(body.includes(t)&&!out.includes(t))out.push(t);
  }
 }
 return out;
}
export function satisfiesSubjects(text,terms){const value=flat(text);return terms.every(t=>value.includes(flat(t)));}
