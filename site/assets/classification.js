// List intent resolves a named subject to its original definition, not any
// paragraph containing a generic word such as 종류. Aliases stay explicit.
import {activeArticles} from './provisions.js?v=20261024-17';
import {legalUnits} from './evidence.js?v=20261024-17';
const flat=s=>s.replace(/[\s“”"「」『』·ㆍ?？.]/gu,'');
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
export function classificationRequest(question){
 const q=flat(question);
 const intent=/종류|분류|목록|리스트|어떤질병|무슨질병|어떤것|무엇이있|뭐가있|몇종/u.test(q);
 const animalDisease=/(?:법정(?:가축)?전염병|가축(?:법정)?전염병|(?:제)?\d+종(?:가축)?전염병)/u.test(q);
 if(animalDisease&&!/사람|인체|인간|식물/u.test(q)&&!/신고|보상|소독|살처분|처벌|과태료|수입|수출|조치|예방|검사|대응|역학|해제/u.test(q)&&
    (intent||/제?\d+종/u.test(q)||/정의|이란|무엇/u.test(q)||/^(?:법정(?:가축)?전염병|가축(?:법정)?전염병|제?[123]종(?:가축)?전염병)$/u.test(q))){
  const grades=[...new Set([...q.matchAll(/제?(\d+)종/gu)].map(m=>Number(m[1])))];
  return {subject:'가축전염병',grade:grades.length===1?grades[0]:null,grades,alias:q.includes('법정')};
 }
 if(!intent)return null;
 // Only a direct list request, not "종류별 보상금" or an operational question.
 const m=q.match(/^(.+?)(?:의)?(?:종류|분류|목록|리스트)(?:(?:은|는|을|를)?(?:알려주세요|알려줘|보여주세요|무엇인가요|뭔가요|어떻게되나요|가어떻게되나요|가뭔가요|가있나요))?$/u);
 return m?{subject:m[1].replace(/의$/u,''),grade:null,alias:false}:null;
}
function spans(article,start,end){
 const {src}=legalUnits(article);
 return src.spans.flatMap(p=>{const a=Math.max(start,p.start),b=Math.min(end,p.end);if(a>=b)return [];
  const text=p.text.slice(a-p.start,b-p.start);return text.trim()?[{page:p.page,text,display:text.replace(/\s+/gu,' ').trim()}]:[];
 });
}
export function classificationSources(entries,request,asOf){
 const result=[];if(request.grades?.some(g=>![1,2,3].includes(g)))return result;
 const wanted=grade=>request.grades?.length?request.grades.includes(grade):!request.grade||request.grade===grade;
 for(const entry of entries){
  if(entry.doc.type==='SOP')continue;
  for(const article of activeArticles(entry,asOf).filter(a=>a.title==='정의')){
   for(const unit of legalUnits(article).units){
    if(!unit.item)continue;
    const text=unit.parts.map(p=>p.text).join('\n');
    if(!new RegExp('^\\s*\\d+\\.\\s*[“"「『]'+escape(request.subject)+'[”"」』]\\s*(?:이란|란|이라\\s*함은|라\\s*함은)','u').test(text))continue;
    let focus;
    if(request.subject==='가축전염병'&&entry.doc.type==='법률'){
     const {src}=legalUnits(article),body=src.text.slice(unit.start,unit.end);
     const grades=[...body.matchAll(/(?:^|\n)[ \t]*[가나다]\.[ \t]*제([123])종[ \t]*가축전염병/gu)];
     if(grades.length!==3)continue; // A changed layout needs review, not a guessed list.
     focus=[{label:'가축전염병 분류 근거 · '+unit.label,parts:spans(article,unit.start,unit.start+grades[0].index)}];
     for(let i=0;i<grades.length;i++)if(wanted(Number(grades[i][1])))focus.push({label:'제'+grades[i][1]+'종 가축전염병',parts:spans(article,unit.start+grades[i].index,unit.start+(grades[i+1]?.index??body.length))});
    }else if(!request.grade&&(request.subject==='가축'||/다음[^.]{0,40}각\s*목/u.test(text)))focus=[{label:request.subject+' · '+unit.label,parts:unit.parts,paragraph:unit.paragraph,item:unit.item}];
    if(focus?.length)result.push({entry,article,parts:unit.parts,focus});
   }
  }
 }
 if(request.subject==='가축전염병')for(const entry of entries.filter(e=>e.doc.type==='시행규칙'&&e.doc.disease==='공통')){
  for(const article of activeArticles(entry,asOf)){
   const focus=[];
   for(const u of legalUnits(article).units.filter(u=>!u.item)){
    const text=flat(u.parts.map(p=>p.text).join(''));
    // The original citation binds each additional list to the statutory grade.
    const grade=/제2조제2호나목/.test(text)?2:/제2조제2호다목/.test(text)?3:null;
    if(!grade||!wanted(grade)||!text.includes('전염성질병'))continue;
    focus.push({label:'제'+grade+'종 추가 지정 질병 · '+u.label,parts:u.parts,paragraph:u.paragraph,item:null});
   }
   if(focus.length)result.push({entry,article,parts:focus.flatMap(f=>f.parts),focus});
  }
 }
 return result;
}
