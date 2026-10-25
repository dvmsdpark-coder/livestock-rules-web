import {literalSubjects,isQueryNoise} from './query-contract.js?v=20261025-7';
import {qualificationRequest,qualificationRetrieval} from './qualifications.js?v=20261025-7';
// Corpus-derived clause retrieval; source excerpts, never a generated legal answer.
import {activeArticles,searchableChunk} from './provisions.js?v=20261025-7';
import {legalUnits,references} from './evidence.js?v=20261025-7';
import {sopIndex} from './sop-index.js?v=20261025-7';
const flat=s=>s.normalize('NFKC').replace(/[\sㆍ·“”"「」『』()（）,.:：]/gu,'').toLowerCase();
const generic=new Set(['가축','전염병','가축전염병','방역','규정','관련','대한','대하여','위한','경우','사항','조치','방법','기준','요령','발생','발생시','대상','실시','관리','따른','따라','절차','등의','범위','의무','처리','구제역','아프리카돼지열병','조류인플루엔자','고병원성','농장','발생농장','가축의','지역','필요한','있는','없는','위하여','하여야','관한','어떤','검출시','고병원성ai','어떻게','어디에','어디','하나요','되나요','받나요','있나요','무엇','무엇인가요','조건','검출','확인','방역조치','언제','알려주세요','근거','비교','차이','차이점','종류','분류','목록','리스트','유형','구분','항목']);
export const concepts=[
 ['가축전염병',['가축전염병','법정가축전염병','가축법정전염병','법정전염병']],
 ['분뇨',['분뇨','가축분뇨','분변','똥']],
 ['재입식',['재입식','재사육','다시입식','다시키우','다시키워','다시사육','가축입식']],
 ['보상',['보상','보상금','보상받','손실보상']],
 ['생계안정',['생계안정','생계비']],
 ['소득안정',['소득안정']],
 ['지원',['지원','지급']],
 ['이동제한',['이동제한','이동금지','반출금지']],
 ['해제',['해제','풀리','풀어']],
 ['예방접종',['예방접종','백신접종','백신맞','백신','미접종']],
 ['살처분',['살처분']],
 ['사체',['사체','폐사체','죽은가축']],
 ['소독',['소독','소독하','세척']],
 ['신고',['신고','신고처','신고기관']],
 ['역학조사',['역학조사','역학조사란']],
 ['검사',['검사','검사받']],
 ['의심',['의심','의사환축']],
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
 ['최저지급',['최소','최저','보장','하한']],
 ['경감',['경감','완화']],
 ['처벌',['처벌','벌칙','벌금','과태료']],
 ['감액',['감액','삭감','거부','지급하지','지급안']]
].map(([name,aliases])=>({name,aliases:aliases.map(flat)}));
const actionNames=new Set(['해제','검사','소독','폐기','매몰','반입','반출','소각','신고','처리','보존기간','감액','지원','처벌','경감','최저지급']);
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
function anchorsFor(question,indexes,entries){
 const tokens=(question.match(/[가-힣A-Za-z]+/gu)||[]).map(flat),q=flat(question),found=concepts.filter(c=>c.name==='처리'?tokens.some(t=>/^(?:처리|처분)/u.test(t)):c.aliases.some(a=>tokens.some(t=>t.includes(a))||a.length>=4&&q.includes(a)));
 const spans=found.flatMap(c=>c.aliases.filter(a=>q.includes(a)));
 const vocabulary=new Set(indexes.flatMap(i=>[...i.vocabulary]));
 const extra=[...vocabulary].filter(t=>!generic.has(t)&&tokens.some(token=>token===t||token.startsWith(t)&&/^(?:은|는|이|가|을|를|의|에|에서|으로|란|이라|하|해|할|하면|인가|입니)/u.test(token.slice(t.length)))&&!spans.some(a=>a.includes(t)||['생계안정','소득안정'].includes(a)&&t.startsWith(a)&&/^(?:비용|자금|지원금|지원비)/u.test(t.slice(a.length))))
  .map(t=>{const stem=t.replace(/(?:에서는|으로|에서|에게|의|을|를|은|는)$/u,'');return vocabulary.has(stem)?stem:t;}).filter(t=>!isQueryNoise(t)).sort((a,b)=>b.length-a.length).filter((t,i,a)=>!a.slice(0,i).some(long=>long.includes(t)));
 const known=[...found,...extra.slice(0,6).map(t=>({name:t,aliases:[t]}))];
 const literal=literalSubjects(entries,question,known.flatMap(a=>a.aliases));
 return [...known,...literal.filter(t=>!known.some(a=>a.aliases.includes(t))).map(t=>({name:t,aliases:[t],literalScope:true}))];
}
const sectionTitle=s=>flat(s).replace(/^\d+(?:\.\d+)*[.]?/u,'').replace(/[?？]/gu,'');
const requestTitle=s=>sectionTitle(s).replace(/^(?:hpai|ai|asf|fmd|구제역|아프리카돼지열병|조류인플루엔자)/u,'').replace(/(?:을|를|은|는)?(?:알려주세요|설명해주세요|알려줘)$/u,'').replace(/[을를은는]$/u,'');
const matches=(text,a)=>a.aliases.some(alias=>(a.name==='처리'?text.replace(/처리업|처리시설|처리장/gu,''):text).includes(alias));
export function retrieve(entries,question,asOf,target,subjectCorpus=entries){
 if(qualificationRequest(question))return qualificationRetrieval(entries,question,asOf);
 const indexes=entries.map(e=>indexFor(e,asOf));
 const obligationRequest=/의무|준수사항/u.test(question);
 const roleRequest=/의무|준수사항|역할|직무|권한|책무|업무(?!량)|하는\s*일|해야\s*할\s*일|무슨\s*일|어떤\s*일/u.test(question);
 const roleWords=new Set(['방역관리','의무','준수사항','역할','업무','직무','권한','책무','하는일','해야할일','내용','무슨','정리','설명']);
 const anchors=anchorsFor(question,indexes,subjectCorpus).filter(a=>!roleRequest||!roleWords.has(a.name)).filter(a=>!roleRequest||!question.includes('축산계열화사업자')||a.name!=='가금');
 const actors=roleRequest?anchors.filter(a=>!concepts.some(c=>c.name===a.name)&&(indexes.some(i=>i.rows.some(r=>matches(r.heading,a)))||/관|사|본부|기관|위원회|위원|위원장|책임자$/u.test(a.name))):[];
 const roleSearch=actors.length>0;
 const roleRoots=roleSearch?entries.filter(e=>e.doc.type==='법률').flatMap(e=>activeArticles(e,asOf).filter(a=>actors.some(actor=>actor.aliases.includes(flat(a.title))||actor.name==='축산계열화사업자'&&matches(flat(a.title),actor))).map(a=>({id:e.doc.id,number:a.number}))):[];
 const penaltyRequest=anchors.some(a=>a.name==='처벌');
 const benefits=anchors.filter(a=>['생계안정','소득안정'].includes(a.name));
 const subjects=anchors.filter(a=>!actionNames.has(a.name)&&(!penaltyRequest||a.name!=='가축전염병')),required=subjects.length?subjects:anchors.filter(a=>!penaltyRequest||a.name!=='가축전염병'&&a.name!=='처벌');
 if(!anchors.length)return {status:'no_terms',anchors:[],hits:[],sopHits:[],supplement:[]};
 const rows=indexes.flatMap((i,n)=>i.rows.map(row=>({...row,entry:entries[n]}))),total=rows.length||1;
 const weights=new Map(anchors.map(a=>[a.name,Math.log(1+total/(1+rows.filter(r=>matches(r.text+r.heading+r.context,a)).length))]));
 const scored=[],actions=anchors.filter(a=>actionNames.has(a.name)&&a.name!=='처벌');
 const qualifiers=['발생농장','관리지역','보호지역','예찰지역'].filter(t=>flat(question).includes(t));
 for(const r of rows){
  const penalty=penaltyRequest&&/^(?:벌칙|과태료)$/u.test(r.article.title);
  if(penaltyRequest&&!penalty)continue;
  const cited=penalty||roleSearch&&actors.some(a=>a.name==='축산계열화사업자')?references(r.unit.parts.map(p=>p.text).join(' '),r.entry.doc,entries).flatMap(ref=>{const e=entries.find(e=>e.doc.id===ref.documentId),a=e&&activeArticles(e,asOf).find(a=>a.number===ref.articleNumber);return a?[flat(a.title)]:[];}).join(' '):'';
  const subjectText=r.text+r.heading+r.context+cited;
  if(penaltyRequest&&anchors.some(a=>a.name==='가축전염병')&&anchors.some(a=>a.name==='신고')&&!cited.includes('죽거나병든가축의신고'))continue;
  if(roleSearch&&/벌칙|과태료|처벌/u.test(r.heading)&&!/벌칙|과태료|처벌/u.test(question))continue;
  if(benefits.length){
   if(r.unit.item||!benefits.some(a=>matches(r.text,a)))continue;
  }else if(roleSearch){
   if(r.unit.item)continue;
  }else if(r.wholeParagraph&&!anchors.some(a=>a.literalScope&&matches(r.text,a)))continue;
  // Every identified subject must occur in the unit or its own article heading.
  // A parent introduction can supply conditions, but cannot alone make a sibling item relevant.
  if(r.entry.doc.disease!=='공통'&&qualifiers.length&&!qualifiers.every(t=>flat(r.article.parts.map(p=>p.text).join(' ')).includes(t)))continue;
  if(!required.filter(a=>!benefits.includes(a)).every(a=>matches(subjectText,a))||!benefits.length&&!required.every(a=>matches(subjectText,a)))continue;
  if(actions.length&&!actions.some(a=>matches(r.text+r.heading+cited,a)))continue;
  const direct=anchors.filter(a=>matches(r.text+r.context+cited,a)),heading=anchors.filter(a=>matches(r.heading,a));
  if(!direct.length)continue;
  const matched=anchors.filter(a=>direct.includes(a)||heading.includes(a));
  const actorHeading=roleSearch&&actors.some(a=>matches(r.heading,a));
  const roleOwn=flat(r.unit.parts.map(p=>p.text).join(' ').replace(/^\s*제\s*\d+\s*조(?:\s*의\s*\d+)?\([^)]*\)/u,'').replace(/^\s*[①-⑳]\s*/u,''));
  const actorSubject=roleSearch&&(actors.some(a=>a.name==='축산계열화사업자')&&/(?:가금)?축산계열화사업자(?:은|는)/u.test(roleOwn)||actors.some(a=>a.aliases.some(alias=>new RegExp('^'+alias+'(?:은|는|이(?!란)|가|ㆍ|ᆞ|또는|및)').test(roleOwn))));
  if(roleSearch&&actors.some(a=>a.name==='축산계열화사업자')&&r.entry.doc.type==='시행규칙'&&/^(?:검역본부장|농림축산식품부장관)/u.test(roleOwn))continue;
  const operational=roleSearch&&/업무|담당|수행|할수있|하여야|검사|질문|채취|지도|감독|예찰|조사/u.test(r.text);
  if(roleSearch&&actorHeading&&!operational&&!/교육|증표/u.test(r.heading)&&!cited)continue;
  if(roleSearch&&r.entry.doc.type==='법률'&&actors.some(a=>a.name==='축산계열화사업자')&&!actorSubject&&!(actorHeading&&r.unit.paragraph===1))continue;
  const roleDelegated=roleSearch&&references(r.unit.parts.map(p=>p.text).join(' '),r.entry.doc,entries).some(ref=>roleRoots.some(root=>root.id===ref.documentId&&root.number===ref.articleNumber));
  const actorRoot=roleSearch&&actors.some(a=>a.aliases.includes(r.heading)||a.name==='축산계열화사업자'&&matches(r.heading,a));
  const roleScore=roleSearch?(actorHeading?25:0)+(actorRoot?50:0)+(actorSubject?15:0)+(actorSubject&&operational?20:0)+(roleDelegated?20:0)-(!actorHeading&&/소유자|종사자/u.test(r.heading)?25:0)-(/자격|임명|위촉/u.test(r.text)&&!/담당|업무범위/u.test(r.text)?20:0):0;
  const score=roleScore+matched.reduce((n,a)=>n+weights.get(a.name),0)+heading.reduce((n,a)=>n+weights.get(a.name)*3,0)+matched.length/anchors.length*2;
  scored.push({...r,score,actorHeading,actorRoot,roleDelegated,matched:matched.map(a=>a.name)});
 }
 scored.sort((a,b)=>b.score-a.score||a.article.number.localeCompare(b.article.number,'ko'));
 const groups=[];
 for(const row of scored){
  if(!row.wholeParagraph&&scored.some(parent=>parent.wholeParagraph&&parent.entry.doc.id===row.entry.doc.id&&parent.article.number===row.article.number&&parent.unit.paragraph===row.unit.paragraph))continue;
  const key=row.entry.doc.id+':'+row.article.number;let group=groups.find(g=>g.key===key);
  if(!group){group={key,doc:row.entry.doc,article:row.article,score:row.score,actorHeading:row.actorHeading,actorRoot:row.actorRoot,roleDelegated:row.roleDelegated,scopes:[],matched:row.matched};groups.push(group);}
  if(group.scopes.length<(actors.some(a=>a.name==='축산계열화사업자')?5:benefits.length?3:2))group.scopes.push({paragraph:row.unit.paragraph,item:row.unit.item});
 }
 if(roleSearch)groups.sort((a,b)=>Number(b.actorRoot)-Number(a.actorRoot)||Number(b.roleDelegated)-Number(a.roleDelegated)||({'법률':0,'시행령':1,'시행규칙':2,'고시':3}[a.doc.type]??9)-({'법률':0,'시행령':1,'시행규칙':2,'고시':3}[b.doc.type]??9)||b.score-a.score);
 if(target&&!roleSearch)groups.sort((a,b)=>Number(b.doc.disease===target)-Number(a.doc.disease===target)||b.score-a.score);
 if(benefits.length||anchors.some(a=>a.name==='보상'))groups.sort((a,b)=>({'법률':0,'시행령':1}[a.doc.type]??9)-({'법률':0,'시행령':1}[b.doc.type]??9)||b.score-a.score);
 for(const g of groups)if(benefits.length){
  // Include a separately numbered exception explicitly tied to a selected paragraph.
  for(const u of legalUnits(g.article).units.filter(u=>!u.item)){
   const text=flat(u.parts.map(p=>p.text).join(' ')),m=text.match(/^(?:[①-⑳]|\d{1,2})?제(\d+)항에도불구하고/u);
   if(m&&g.scopes.some(s=>s.paragraph===Number(m[1]))&&!g.scopes.some(s=>s.paragraph===u.paragraph))g.scopes.push({paragraph:u.paragraph,item:null});
  }
  g.scopes.sort((a,b)=>(a.paragraph||0)-(b.paragraph||0));
 }
 // Role questions retain the strongest source from each legal layer before
 // filling additional slots; mentions in one layer cannot displace all others.
 let ordered=groups;
 if(roleSearch){
  const representatives=actors.some(a=>a.name==='축산계열화사업자')?groups.filter(g=>g.actorRoot||g.roleDelegated):['법률','시행령','시행규칙'].map(type=>groups.find(g=>g.doc.type===type)).filter(Boolean);
  for(const disease of [...new Set(entries.filter(e=>e.doc.type==='고시'&&e.doc.disease!=='공통').map(e=>e.doc.disease))]){const g=groups.find(g=>g.doc.type==='고시'&&g.doc.disease===disease);if(g)representatives.push(g);}
  ordered=[...representatives,...groups.filter(g=>!representatives.includes(g))];
 }
 if(actors.some(a=>a.name==='축산계열화사업자'))for(const g of ordered)g.scopes.sort((a,b)=>(a.paragraph||0)-(b.paragraph||0));
 const hits=ordered.slice(0,roleSearch?8:6);
 // Rank complete numbered SOP units, including page continuations, rather than page hits.
 const sopHits=[];
 const titleQuery=requestTitle(question),actionRequest=roleSearch||/조치|요령|어떻게|운영|운용|처리|소독|설정|해제|재입식|방역/u.test(question);
 const operational=/조치|요령|운영|운용|처리|소독|설정|해제|재입식|방역|채취|공급|교육|지원|제한|검사|진단|기본원칙/u;
 for(const entry of entries)if(!penaltyRequest&&!obligationRequest&&entry.doc.type==='SOP')for(const section of sopIndex(entry).sections){
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
   sopHits.push({doc:entry.doc,section,unit,exactTitle,stageBoost,affinity:subjects.filter(a=>matches(flat(section.heading),a)).length,score:(roleSearch?5:0)+direct.length*2+headingHits.length*4+direct.length/anchors.length+stageBoost+exactHeading-(section.layout==='table'?20:0)});
  }
 }
 sopHits.sort((a,b)=>b.score-a.score||a.section.parts[0].page-b.section.parts[0].page);
 const sopGroups=[];
 for(const hit of sopHits){let g=sopGroups.find(g=>g.section.key===hit.section.key);
  if(!g){g={doc:hit.doc,section:hit.section,units:[],score:hit.score,exactTitle:hit.exactTitle,affinity:hit.affinity,stageBoost:hit.stageBoost};sopGroups.push(g);}
  if(g.units.length<2)g.units.push(hit.unit);
 }
 const exactGroups=sopGroups.filter(g=>g.exactTitle);
 let selectedSop=exactGroups.length?exactGroups:sopGroups.filter(g=>g.score>=Math.max(5,(sopGroups[0]?.score||0)*0.65));
 if(roleSearch){const first=[...new Set(selectedSop.map(g=>g.doc.disease))].map(d=>selectedSop.find(g=>g.doc.disease===d));selectedSop=[...first,...selectedSop.filter(g=>!first.includes(g))];}
 for(const [i,g] of selectedSop.entries())g.primary=roleSearch?hits.length===0:i===0||g.exactTitle||g.stageBoost>0||g.affinity>0&&g.score>=selectedSop[0].score*0.85;
 const supplement=[];
 const needsDetail=/희석|몇\s*배|농도|용량/u.test(question);
 return {scopeTerms:anchors.filter(a=>a.literalScope).map(a=>a.name),roleSearch,actors:actors.map(a=>a.name),benefits:benefits.map(a=>a.name),needsDetail,status:needsDetail?'needs_detail':hits.length||selectedSop.length?'matched':'no_match',anchors:anchors.map(a=>a.name),hits,sopHits:selectedSop.slice(0,4),supplement};
}
