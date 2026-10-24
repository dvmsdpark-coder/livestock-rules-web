// Corpus-derived clause retrieval; source excerpts, never a generated legal answer.
import {activeArticles,searchableChunk} from './provisions.js?v=20261024-6';
import {legalUnits} from './evidence.js?v=20261024-6';
const flat=s=>s.normalize('NFKC').replace(/[\sㆍ·“”"「」『』()（）,.:：]/gu,'').toLowerCase();
const generic=new Set(['가축','전염병','가축전염병','방역','규정','관련','대한','대하여','위한','경우','사항','조치','방법','기준','요령','발생','발생시','대상','실시','관리','따른','따라','절차','등의','범위','의무','처리','구제역','아프리카돼지열병','조류인플루엔자','고병원성','농장','발생농장','가축의','지역','필요한','있는','없는','위하여','하여야','관한']);
export const concepts=[
 ['분뇨',['분뇨','가축분뇨','분변','똥']],
 ['재입식',['재입식','재사육','다시입식','다시키우','다시키워','다시사육','가축입식']],
 ['보상',['보상','보상금','보상받','손실보상']],
 ['생계안정',['생계안정','생계비']],
 ['이동제한',['이동제한','이동금지','반출금지']],
 ['해제',['해제','풀리','풀어']],
 ['예방접종',['예방접종','백신접종','백신맞']],
 ['살처분',['살처분']],
 ['사체',['사체','폐사체','죽은가축']],
 ['소독',['소독','소독하','세척']],
 ['신고',['신고','신고처','신고기관']],
 ['역학조사',['역학조사','역학조사란']],
 ['검사',['검사','검사받']],
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
const actionNames=new Set(['해제','검사','소독','폐기','매몰','반입','반출','소각','신고','처리','보존기간','감액']);
const cache=new WeakMap();
function indexFor(entry,asOf){
 let dates=cache.get(entry.index);if(!dates){dates=new Map();cache.set(entry.index,dates);}if(dates.has(asOf))return dates.get(asOf);
 const rows=[],vocabulary=new Set();
 for(const article of activeArticles(entry,asOf)){
  if(entry.doc.type==='SOP')continue;
  for(const raw of article.title.match(/[가-힣A-Za-z]{2,}/gu)||[]){
   const word=raw.replace(/(?:에서|으로|에게|의|을|를|은|는)$/u,'');
   if(word.length>=2&&!generic.has(word))vocabulary.add(flat(word));
  }
  const units=legalUnits(article).units;
  for(const parent of units.filter(u=>!u.item)){
   const children=units.filter(u=>u.item&&u.paragraph===parent.paragraph);
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
 const extra=[...vocabulary].filter(t=>!generic.has(t)&&tokens.some(token=>token===t||token.startsWith(t)&&/^(?:은|는|이|가|을|를|의|에|에서|으로|란|이라|하|해|할|하면|인가|입니)/u.test(token.slice(t.length)))&&!spans.some(a=>a.includes(t)))
  .sort((a,b)=>b.length-a.length).filter((t,i,a)=>!a.slice(0,i).some(long=>long.includes(t)));
 return [...found,...extra.slice(0,6).map(t=>({name:t,aliases:[t]}))];
}
const matches=(text,a)=>a.aliases.some(alias=>(a.name==='처리'?text.replace(/처리업|처리시설|처리장/gu,''):text).includes(alias));
export function retrieve(entries,question,asOf,target){
 const indexes=entries.map(e=>indexFor(e,asOf)),anchors=anchorsFor(question,indexes);
 const subjects=anchors.filter(a=>!actionNames.has(a.name)),required=subjects.length?subjects:anchors;
 if(!anchors.length)return {status:'no_terms',anchors:[],hits:[],supplement:[]};
 const rows=indexes.flatMap((i,n)=>i.rows.map(row=>({...row,entry:entries[n]}))),total=rows.length||1;
 const weights=new Map(anchors.map(a=>[a.name,Math.log(1+total/(1+rows.filter(r=>matches(r.text+r.heading+r.context,a)).length))]));
 const scored=[],actions=anchors.filter(a=>actionNames.has(a.name));
 const qualifiers=['발생농장','관리지역','보호지역','예찰지역'].filter(t=>flat(question).includes(t));
 for(const r of rows){
  // Every identified subject must occur in the unit or its own article heading.
  // A parent introduction can supply conditions, but cannot alone make a sibling item relevant.
  if(r.entry.doc.disease!=='공통'&&qualifiers.length&&!qualifiers.every(t=>flat(r.article.parts.map(p=>p.text).join(' ')).includes(t)))continue;
  if(!required.every(a=>matches(r.text+r.heading+r.context,a)))continue;
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
  if(group.scopes.length<2)group.scopes.push({paragraph:row.unit.paragraph,item:row.unit.item});
 }
 if(target)groups.sort((a,b)=>Number(b.doc.disease===target)-Number(a.doc.disease===target)||b.score-a.score);
 const hits=groups.slice(0,6);
 // SOP chunks and partially matched clauses are explicitly labelled candidates.
 const supplement=[];
 for(const entry of entries)if(entry.doc.type==='SOP')for(const part of entry.index.chunks){
  if(!searchableChunk(entry,part,asOf)||['form','figure','table'].includes(part.kind))continue;
  const text=flat(part.text);if(!required.every(a=>matches(text,a)))continue;
  const matched=anchors.filter(a=>matches(text,a));if(!matched.length)continue;
  supplement.push({doc:entry.doc,part,score:matched.length+anchors.filter(a=>matches(flat(part.heading||''),a)).length});
 }
 supplement.sort((a,b)=>b.score-a.score);
 const needsDetail=/희석|몇\s*배|농도|용량/u.test(question);
 return {needsDetail,status:needsDetail?'needs_detail':hits.length?'matched':supplement.length?'candidates':'no_match',anchors:anchors.map(a=>a.name),hits,supplement:supplement.slice(0,3)};
}
