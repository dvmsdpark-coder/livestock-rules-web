// Corpus-derived clause retrieval; source excerpts, never a generated legal answer.
import {activeArticles,searchableChunk} from './provisions.js?v=20261024-11';
import {legalUnits} from './evidence.js?v=20261024-11';
import {sopIndex} from './sop-index.js?v=20261024-11';
const flat=s=>s.normalize('NFKC').replace(/[\sㆍ·“”"「」『』()（）,.:：]/gu,'').toLowerCase();
const generic=new Set(['가축','전염병','가축전염병','방역','규정','관련','대한','대하여','위한','경우','사항','조치','방법','기준','요령','발생','발생시','대상','실시','관리','따른','따라','절차','등의','범위','의무','처리','구제역','아프리카돼지열병','조류인플루엔자','고병원성','농장','발생농장','가축의','지역','필요한','있는','없는','위하여','하여야','관한','어떤','검출시','고병원성ai','어떻게','어디에','어디','하나요','되나요','받나요','있나요','무엇','무엇인가요','조건','검출','확인','방역조치','언제','알려주세요','근거','비교','차이','차이점']);
export const concepts=[
 ['분뇨',['분뇨','가축분뇨','분변','똥']],
 ['재입식',['재입식','재사육','다시입식','다시키우','다시키워','다시사육','가축입식']],
 ['보상',['보상','보상금','보상받','손실보상']],
 ['생계안정',['생계안정','생계비']],
 ['소득안정',['소득안정']],
 ['지원',['지원','지급']],
 ['이동제한',['이동제한','이동금지','반출금지']],
 ['해제',['해제','풀리','풀어']],
 ['예방접종',['예방접종','백신접종','백신맞']],
 ['살처분',['살처분']],
 ['사체',['사체','폐사체','죽은가축']],
 ['소독',['소독','소독하','세척']],
 ['신고',['신고','신고처','신고기관']],
 ['역학조사',['역학조사','역학조사란']],
 ['검사',['검사','검사받']],
 ['확진',['확진','확진시','확진된','확진될']],
 ['사료',['사료','먹이']],
 ['원유',['원유','집유']],
 ['축산차량',['시설출입차량','축산차량','차량등록','차량의등록']],
 ['일시이동중지',['일시이동중지','스탠드스틸','standstill']],
 ['출입기록',['출입기록','방문기록','출입정보']],
 ['매몰',['매몰','묻어']],
 ['폐기',['폐기','버려','버리','없애']],
 ['반입',['반입','들여와','들여오']],
 ['반출',['반출','내보내']],
 ['소각',['소각','태워']],
 ['격리',['격리']],
 ['수입',['수입']],
 ['수출',['수출']],
 ['검역',['검역']],
 ['처리',['처리','폐기','소각','매몰','소독','화학적처리']],
 ['보존기간',['보존기간','보관기간','보관','보존','기간','기한']],
 ['감액',['감액','삭감','거부','지급하지','지급안']]
].map(([name,aliases])=>({name,aliases:aliases.map(flat)}));
const actionNames=new Set(['해제','검사','소독','폐기','매몰','반입','반출','소각','신고','처리','보존기간','감액','지원']);
const cache=new WeakMap();
function indexFor(entry,asOf){
 let dates=cache.get(entry.index);if(!dates){dates=new Map();cache.set(entry.index,dates);}if(dates.has(asOf))return dates.get(asOf);
 const rows=[],vocabulary=new Set();
 if(entry.doc.type==='SOP')for(const word of sopIndex(entry).vocabulary)if(!generic.has(word))vocabulary.add(flat(word));
 for(const article of activeArticles(entry,asOf)){
  if(entry.doc.type==='SOP')continue;
  for(const raw of article.title.match(/[가-힣A-Za-z]{2,}/gu)||[]){
   const word=raw.replace(/(?:에서|으로|에게|의|을|를|은|는)$/u,'');
   if(word.length>=2&&!generic.has(word))vocabulary.add(flat(word));
  }
  const units=legalUnits(article).units;
  for(const parent of units.filter(u=>!u.item)){
   const children=units.filter(u=>u.item&&u.paragraph===parent.paragraph);
   if(children.length)rows.push({article,unit:parent,text:flat(parent.parts.map(p=>p.text).join(' ')),context:'',heading:flat(article.title),wholeParagraph:true});
   for(const unit of children.length?children:[parent]){
    const own=unit.parts.map(p=>p.text).join(' '),intro=children.length?parent.parts.map(p=>p.text).join(' ').split(/\n?\s*1\./u)[0]:'';
    rows.push({article,unit,text:flat(own),context:flat(intro),heading:flat(article.title)});
   }
  }
 }
 for(const d of entry.index.definitions||[]){const t=flat(d.term);if(t.length>=2&&!generic.has(t))vocabulary.add(t);}
 const value={rows,vocabulary};dates.set(asOf,value);return value;
}
function anchorsFor(question,indexes){
 const tokens=(question.match(/[가-힣A-Za-z]+/gu)||[]).map(flat),q=flat(question),found=concepts.filter(c=>c.name==='처리'?tokens.some(t=>/^(?:처리|처분)/u.test(t)):c.aliases.some(a=>tokens.some(t=>t.includes(a))||a.length>=4&&q.includes(a)));
 const spans=found.flatMap(c=>c.aliases.filter(a=>q.includes(a)));
 const vocabulary=new Set(indexes.flatMap(i=>[...i.vocabulary]));
 const extra=[...vocabulary].filter(t=>!generic.has(t)&&tokens.some(token=>token===t||token.startsWith(t)&&/^(?:은|는|이|가|을|를|의|에|에서|으로|란|이라|하|해|할|하면|인가|입니)/u.test(token.slice(t.length)))&&!spans.some(a=>a.includes(t)||['생계안정','소득안정'].includes(a)&&t.startsWith(a)&&/^(?:비용|자금|지원금|지원비)/u.test(t.slice(a.length))))
  .sort((a,b)=>b.length-a.length).filter((t,i,a)=>!a.slice(0,i).some(long=>long.includes(t)));
 return [...found,...extra.slice(0,6).map(t=>({name:t,aliases:[t]}))];
}
const sectionTitle=s=>flat(s).replace(/^\d+(?:\.\d+)*[.]?/u,'').replace(/[?？]/gu,'');
const requestTitle=s=>sectionTitle(s).replace(/^(?:hpai|ai|asf|fmd|구제역|아프리카돼지열병|조류인플루엔자)/u,'').replace(/(?:을|를|은|는)?(?:알려주세요|설명해주세요|알려줘)$/u,'').replace(/[을를은는]$/u,'');
const matches=(text,a)=>a.aliases.some(alias=>(a.name==='처리'?text.replace(/처리업|처리시설|처리장/gu,''):text).includes(alias));
export function retrieve(entries,question,asOf,target){
 const indexes=entries.map(e=>indexFor(e,asOf)),anchors=anchorsFor(question,indexes);
 const benefits=anchors.filter(a=>['생계안정','소득안정'].includes(a.name));
 const subjects=anchors.filter(a=>!actionNames.has(a.name)),required=subjects.length?subjects:anchors;
 if(!anchors.length)return {status:'no_terms',anchors:[],hits:[],sopHits:[],supplement:[]};
 const rows=indexes.flatMap((i,n)=>i.rows.map(row=>({...row,entry:entries[n]}))),total=rows.length||1;
 const weights=new Map(anchors.map(a=>[a.name,Math.log(1+total/(1+rows.filter(r=>matches(r.text+r.heading+r.context,a)).length))]));
 const scored=[],actions=anchors.filter(a=>actionNames.has(a.name));
 const qualifiers=['발생농장','관리지역','보호지역','예찰지역'].filter(t=>flat(question).includes(t));
 for(const r of rows){
  if(benefits.length){
   if(r.unit.item||!benefits.some(a=>matches(r.text,a)))continue;
  }else if(r.wholeParagraph)continue;
  // Every identified subject must occur in the unit or its own article heading.
  // A parent introduction can supply conditions, but cannot alone make a sibling item relevant.
  if(r.entry.doc.disease!=='공통'&&qualifiers.length&&!qualifiers.every(t=>flat(r.article.parts.map(p=>p.text).join(' ')).includes(t)))continue;
  if(!required.filter(a=>!benefits.includes(a)).every(a=>matches(r.text+r.heading+r.context,a))||!benefits.length&&!required.every(a=>matches(r.text+r.heading+r.context,a)))continue;
  if(actions.length&&!actions.some(a=>matches(r.text+r.heading,a)))continue;
  const direct=anchors.filter(a=>matches(r.text,a)),heading=anchors.filter(a=>matches(r.heading,a));
  if(!direct.length)continue;
  const matched=anchors.filter(a=>direct.includes(a)||heading.includes(a));
  const score=matched.reduce((n,a)=>n+weights.get(a.name),0)+heading.reduce((n,a)=>n+weights.get(a.name)*3,0)+matched.length/anchors.length*2;
  scored.push({...r,score,matched:matched.map(a=>a.name)});
 }
 scored.sort((a,b)=>b.score-a.score||a.article.number.localeCompare(b.article.number,'ko'));
 const groups=[];
 for(const row of scored){
  const key=row.entry.doc.id+':'+row.article.number;let group=groups.find(g=>g.key===key);
  if(!group){group={key,doc:row.entry.doc,article:row.article,score:row.score,scopes:[],matched:row.matched};groups.push(group);}
  if(group.scopes.length<(benefits.length?3:2))group.scopes.push({paragraph:row.unit.paragraph,item:row.unit.item});
 }
 if(target)groups.sort((a,b)=>Number(b.doc.disease===target)-Number(a.doc.disease===target)||b.score-a.score);
 if(benefits.length||anchors.some(a=>a.name==='보상'))groups.sort((a,b)=>({'법률':0,'시행령':1}[a.doc.type]??9)-({'법률':0,'시행령':1}[b.doc.type]??9)||b.score-a.score);
 for(const g of groups)if(benefits.length){
  // Include a separately numbered exception explicitly tied to a selected paragraph.
  for(const u of legalUnits(g.article).units.filter(u=>!u.item)){
   const text=flat(u.parts.map(p=>p.text).join(' ')),m=text.match(/^(?:[①-⑳]|\d{1,2})?제(\d+)항에도불구하고/u);
   if(m&&g.scopes.some(s=>s.paragraph===Number(m[1]))&&!g.scopes.some(s=>s.paragraph===u.paragraph))g.scopes.push({paragraph:u.paragraph,item:null});
  }
  g.scopes.sort((a,b)=>(a.paragraph||0)-(b.paragraph||0));
 }
 const hits=groups.slice(0,6);
 // Rank complete numbered SOP units, including page continuations, rather than page hits.
 const sopHits=[];
 const titleQuery=requestTitle(question),actionRequest=/조치|요령|어떻게|운영|운용|처리|소독|설정|해제|재입식|방역/u.test(question);
 const operational=/조치|요령|운영|운용|처리|소독|설정|해제|재입식|방역|채취|공급|교육|지원|제한|검사|진단|기본원칙/u;
 for(const entry of entries)if(entry.doc.type==='SOP')for(const section of sopIndex(entry).sections){
  const exactTitle=sectionTitle(section.heading)===titleQuery;
  if(actionRequest&&!exactTitle&&!operational.test(section.heading))continue;
  const context=flat(section.heading+' '+section.scenario);
  for(const unit of section.units){
   const own=flat(unit.parts.map(p=>p.text).join(' '));
   if(own.length<50||!required.every(a=>matches(own+context,a)))continue;
   if(actions.length&&!actions.some(a=>matches(own+context,a)))continue;
   const direct=anchors.filter(a=>matches(own,a));if(!direct.length)continue;
   const headingHits=anchors.filter(a=>matches(context,a));
   const exactHeading=exactTitle?40:0;
   const stageBoost=/고병원성|확진/u.test(question)&&/고병원성.*확진|확진.*조치/u.test(section.heading)?8:0;
   sopHits.push({doc:entry.doc,section,unit,exactTitle,stageBoost,affinity:subjects.filter(a=>matches(flat(section.heading),a)).length,score:direct.length*2+headingHits.length*4+direct.length/anchors.length+stageBoost+exactHeading-(section.layout==='table'?20:0)});
  }
 }
 sopHits.sort((a,b)=>b.score-a.score||a.section.parts[0].page-b.section.parts[0].page);
 const sopGroups=[];
 for(const hit of sopHits){let g=sopGroups.find(g=>g.section.key===hit.section.key);
  if(!g){g={doc:hit.doc,section:hit.section,units:[],score:hit.score,exactTitle:hit.exactTitle,affinity:hit.affinity,stageBoost:hit.stageBoost};sopGroups.push(g);}
  if(g.units.length<2)g.units.push(hit.unit);
 }
 const exactGroups=sopGroups.filter(g=>g.exactTitle);
 const selectedSop=exactGroups.length?exactGroups:sopGroups.filter(g=>g.score>=Math.max(5,(sopGroups[0]?.score||0)*0.65));
 for(const [i,g] of selectedSop.entries())g.primary=i===0||g.exactTitle||g.stageBoost>0||g.affinity>0&&g.score>=selectedSop[0].score*0.85;
 const supplement=[];
 const needsDetail=/희석|몇\s*배|농도|용량/u.test(question);
 return {benefits:benefits.map(a=>a.name),needsDetail,status:needsDetail?'needs_detail':hits.length||selectedSop.length?'matched':'no_match',anchors:anchors.map(a=>a.name),hits,sopHits:selectedSop.slice(0,4),supplement};
}
