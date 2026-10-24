import {annexReferences} from './annexes.js?v=20261024-13';
// Source-only presentation and internal legal references. No generated legal text.
import {activeArticles} from './provisions.js?v=20261024-13';
const squash=s=>s.replace(/\s+/gu,'');
const clean=s=>s.replace(/[\sㆍ·]/gu,'');
const circled='①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const readable=s=>s.replace(/([^\n])\n(?!\s*(?:[①-⑳]|\d+(?:\.\d+)*[. ]|[가-힣]\.\s|[-▷※]))/gu,'$1 ').trim();
const uniqueParts=parts=>parts.filter((p,i)=>parts.findIndex(x=>x.page===p.page&&x.text===p.text)===i);
const articleCache=new WeakMap(),unitCache=new WeakMap();
export function articleIn(entry,number,asOf=entry.asOf||entry.doc.from){
 let cache=articleCache.get(entry);if(!cache){cache=new Map();articleCache.set(entry,cache);}const key=number+'@'+asOf;if(cache.has(key))return cache.get(key);
 const found=activeArticles(entry,asOf).find(a=>a.number===number);
 const article=found?{...found,parts:uniqueParts(found.parts)}:null;cache.set(key,article);return article;
}
function source(parts){
 let offset=0;const spans=parts.map(p=>{const s={...p,start:offset,end:offset+p.text.length};offset=s.end+1;return s;});
 return {text:parts.map(p=>p.text).join('\n'),spans};
}
function slices(src,start,end){return src.spans.flatMap(p=>{
 const a=Math.max(start,p.start),b=Math.min(end,p.end);if(a>=b)return [];
 const from=a-p.start,to=b-p.start,text=p.text.slice(from,to);let display=readable(text);
 if(p.display&&squash(p.display)===squash(p.text)){
  const first=squash(p.text.slice(0,from)).length,last=squash(p.text.slice(0,to)).length;
  const positions=[...p.display.matchAll(/\S/gu)].map(m=>m.index);
  if(last>first)display=p.display.slice(positions[first],positions[last-1]+1);
 }
 return text.trim()?[{page:p.page,text,display}]:[];
});}
export function legalUnits(article){
 if(unitCache.has(article))return unitCache.get(article);
 const src=source(article.parts),units=[];
 const paragraphs=[...src.text.matchAll(/(?:^|\n|(?<=\)))\s*([①-⑳])/gu)];
 const ranges=paragraphs.length?paragraphs.map((m,i)=>({start:m.index,end:paragraphs[i+1]?.index??src.text.length,paragraph:circled.indexOf(m[1])+1})): [{start:0,end:src.text.length,paragraph:null}];
 for(const range of ranges){
  const parent={...range,item:null,label:article.number+(range.paragraph?' 제'+range.paragraph+'항':'')};
  units.push({...parent,parts:slices(src,parent.start,parent.end)});
  const text=src.text.slice(range.start,range.end),items=[...text.matchAll(/(?:^|\n)[ \t]*(\d+)\.[ \t]*/gu)].filter(m=>Number(m[1])<=100&&!/^\d{1,2}\.\s*\d{1,2}\.\s*>/u.test(text.slice(m.index).trimStart()));
  for(let i=0;i<items.length;i++){
   const start=range.start+items[i].index,end=range.start+(items[i+1]?.index??text.length),item=Number(items[i][1]);
   units.push({start,end,paragraph:range.paragraph,item,label:parent.label+' 제'+item+'호',parts:slices(src,start,end)});
  }
 }
 const result={src,units};unitCache.set(article,result);return result;
}
function locate(article,parts){
 const parsed=legalUnits(article);let start=Infinity,end=-1;
 for(const part of parts){
  const span=parsed.src.spans.find(p=>p.page===part.page&&p.text.includes(part.text));if(!span)return null;
  const at=span.start+span.text.indexOf(part.text);start=Math.min(start,at);end=Math.max(end,at+part.text.length);
 }
 return parsed.units.filter(u=>u.start<=start&&u.end>=end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0]||null;
}
const numberPattern='제\\s*\\d+\\s*조(?:\\s*의\\s*\\d+)?';
const referencePattern=new RegExp('(?<![가-힣A-Za-z0-9])(?:(「[^」]{1,100}」|『[^』]{1,100}』|가축전염병\\s*예방법(?:\\s*시행(?:령|규칙))?|(?:같은|이)\\s*(?:법|영|규칙)|법|영|규칙)\\s*(?:\\([^\\n)]{0,80}\\)\\s*)?)?('+numberPattern+')(?:\\s*제\\s*(\\d+)\\s*항)?(?:\\s*제\\s*(\\d+)\\s*호)?','gu');
export function references(text,sourceDoc,corpus){
 const refs=[];let previousLaw=null;
 const ofType=type=>corpus.filter(e=>e.doc.type===type&&e.doc.disease==='공통');
 for(const m of text.matchAll(referencePattern)){
  const prefix=clean((m[1]||'').replace(/[「」『』]/gu,'')),number=clean(m[2]),paragraph=m[3]?Number(m[3]):null,item=m[4]?Number(m[4]):null;
  let candidates=[];
  if(prefix==='법'||prefix==='이법'){candidates=sourceDoc.type==='법률'?[{doc:sourceDoc}]:ofType('법률');previousLaw=candidates.length===1?clean(candidates[0].doc.title):null;}
  else if(prefix==='영'||prefix==='이영')candidates=ofType('시행령');
  else if(prefix==='규칙'||prefix==='이규칙')candidates=ofType('시행규칙');
  else if(prefix.startsWith('같은'))candidates=previousLaw===null?[]:corpus.filter(e=>clean(e.doc.title)===previousLaw);
  else if(prefix){previousLaw=prefix;candidates=corpus.filter(e=>clean(e.doc.title)===prefix);}
  else candidates=corpus.filter(e=>e.doc.id===sourceDoc.id);
  const resolved=candidates.map(e=>corpus.find(x=>x.doc.id===e.doc.id)).filter(Boolean).map(e=>({entry:e,article:articleIn(e,number)})).filter(x=>x.article);
  if(resolved.length!==1)continue;
  const {entry,article}=resolved[0];
  if(paragraph||item){const matches=legalUnits(article).units.filter(u=>(!paragraph||u.paragraph===paragraph)&&(!item||u.item===item));if(!matches.length)continue;}
  // Do not turn a displayed article's own heading into a redundant link.
  if(!prefix&&!paragraph&&!item&&text.slice(m.index+m[0].length).startsWith('('))continue;
  refs.push({start:m.index,end:m.index+m[0].length,label:m[0],documentId:entry.doc.id,articleNumber:number,paragraph,item});
 }
 return refs;
}
export function delegationReferences(text,doc,target,corpus){
 if(!target?.articleNumber)return [];
 const result=[];
 for(const m of text.matchAll(/대통령령으로\s*정하는|농림축산식품부령으로\s*정하는/gu)){
  const type=m[0].startsWith('대통령령')?'시행령':'시행규칙',candidates=[];
  for(const e of corpus.filter(e=>e.doc.type===type))for(const a of activeArticles(e)){
   const joined=a.parts.map(p=>p.text).join('\n');
   const exact=references(joined,e.doc,corpus).find(r=>r.documentId===doc.id&&r.articleNumber===target.articleNumber&&(r.paragraph||null)===(target.paragraph||null)&&(r.item||null)===(target.item||null)&&squash(joined.slice(r.end,r.end+160)).includes(squash(m[0])));
   if(exact&&!candidates.some(c=>c.documentId===e.doc.id&&c.articleNumber===a.number))candidates.push({documentId:e.doc.id,articleNumber:a.number});
  }
  if(candidates.length===1)result.push({...candidates[0],start:m.index,end:m.index+m[0].length,label:m[0],kind:'delegation'});
 }
 return result;
}
function addRefs(parts,doc,corpus,target=null){return parts.map(p=>{const text=p.display||p.text;return {...p,references:[...references(text,doc,corpus),...annexReferences(text,doc,corpus),...delegationReferences(text,doc,target,corpus)].sort((a,b)=>a.start-b.start)};});}
function sopUnits(parts){
 const src=source(parts),markers=[...src.text.matchAll(/(?:^|\n)[ \t]*(\d+(?:\.\d+)+)\.?[ \t]*(?=[가-힣「(<-])/gu)];
 return markers.map((m,i)=>{
  const depth=m[1].split('.').length;
  let end=src.text.length;
  for(let j=i+1;j<markers.length;j++)if(markers[j][1].split('.').length<=depth){end=markers[j].index;break;}
  // A new numbered subsection must not be absorbed into the previous unit.
  const boundary=/\n[ \t]*\d+\.[ \t]+(?=[가-힣<])/gu;boundary.lastIndex=m.index+1;const top=boundary.exec(src.text);if(top&&top.index<end)end=top.index;
  return {label:'절차 '+m[1],number:m[1],parts:slices(src,m.index,end),start:m.index,end};
 });
}
function questionIntent(question){
 if(/신고/u.test(question)&&/방법|절차|어떻게|신고사항|무슨내용/u.test(question))return 'reporting-method';
 if(/신고/u.test(question)&&/어디|누구|기관|신고처/u.test(question))return 'reporting';
 if(/이동제한/u.test(question)&&/해제|언제|풀리|며칠/u.test(question))return 'release';
 if(/농장/u.test(question)&&/소독/u.test(question))return 'cleaning';
 return null;
}
function score(text,question){
 const terms=[...question.matchAll(/[가-힣A-Za-z]{2,}/gu)].map(m=>m[0].replace(/(?:인가요|하나요|되나요|에서는|에게|으로|에서|은|는|을|를|의|이|가)$/u,''));
 return terms.filter(t=>t.length>1&&!['어디','어떻게','무엇','알려','주세요','구제역','발생하면'].includes(t)&&squash(text).includes(t)).length;
}
function selectFocus(group,question,mode){
 if(mode==='definition'||group.match==='방역지역 정의 연결')return [{label:group.locator||group.heading,parts:group.parts}];
 if(['form','table','figure'].includes(group.kind))return [];
 const intent=questionIntent(question);
 if(group.docType==='SOP'){
  if(group.sopFocus)return group.sopFocus.map(u=>({...u,note:'SOP 항목 발췌 · 이어지는 페이지와 전체 절의 조건을 함께 확인하세요.'}));
  if(intent==='cleaning'){
   const src=source(group.parts),start=src.text.match(/(?:^|\n)[ \t]*(?:<\s*기본원칙\s*>|\d+\.[ \t]*기본원칙)[^\n]*\n/u);
   if(start){const tail=src.text.slice(start.index+start[0].length),end=tail.search(/\n[ \t]*\d+\.[ \t]+[가-힣]/u);return [{label:'기본원칙',parts:slices(src,start.index,end<0?src.text.length:start.index+start[0].length+end)}];}
  }
  const units=sopUnits(group.parts);
  if(intent==='reporting'||intent==='reporting-method'){
   const u=units.find(u=>u.number==='1.1');if(!u)return [];
   const src=source(u.parts),at=intent==='reporting'?src.text.match(/즉시\s*(?:구제역\s*)?신고/u):null;
   return [{...u,parts:at?slices(src,at.index,src.text.length):u.parts,note:at?'신고처만 발췌 · 신고요건과 후속 조치는 전체 원문에서 확인하세요.':null}];
  }
  if(intent==='release'||intent==='cleaning'){
   const top=units.filter(u=>u.number.startsWith('1.')&&u.number.split('.').length===2);
   if(top.length)return top.slice(0,3);
   const src=source(group.parts),numbered=[...src.text.matchAll(/(?:^|\n)[ \t]*(\d+)\.[ \t]+(?=[가-힣])/gu)];
   if(numbered.length)return [{label:'절차 '+numbered[0][1],parts:slices(src,numbered[0].index,numbered[1]?.index??src.text.length)}];
   return [];
  }
  return [];
 }
 const article=group.article;if(!article)return [];
 const parsed=legalUnits(article),explicit=question.match(/제\s*\d+\s*조(?:\s*의\s*\d+)?(?:\s*제\s*(\d+)\s*항)?(?:\s*제\s*(\d+)\s*호)?/u);
 if(explicit&&(explicit[1]||explicit[2])){
  const matched=parsed.units.filter(u=>(!explicit[1]||u.paragraph===Number(explicit[1]))&&(!explicit[2]||u.item===Number(explicit[2])));
  return matched.length===1?matched:[];
 }
 if(mode==='material'||mode==='ranked'){
  return (group.materialScopes||group.retrievalScopes||[]).flatMap(scope=>{
   const u=parsed.units.find(u=>u.paragraph===scope.paragraph&&u.item===scope.item);if(!u)return [];
   const parent=parsed.units.find(p=>!p.item&&p.paragraph===u.paragraph);
   const first=parsed.units.find(p=>p.item&&p.paragraph===u.paragraph);
   const context=u.item&&first?slices(parsed.src,parent.start,first.start):[];
   return [{...u,parts:[...context,...u.parts],note:u.item?'해당 항의 적용 조건과 관련 호를 함께 발췌했습니다. 다른 호와 전체 맥락은 전체 조문에서 확인하세요.':null}];
  });
 }
 const parents=parsed.units.filter(u=>!u.item);
 if(mode==='topic')return parents.filter(u=>u.paragraph===1||!u.paragraph).slice(0,1);
 if(intent==='reporting'||intent==='reporting-method')return parents.filter(u=>u.paragraph===1||intent==='reporting-method'&&group.docType==='시행규칙'&&[3,4].includes(u.paragraph));
 const ranked=parents.map(u=>({...u,rank:score(u.parts.map(p=>p.text).join(' '),question)})).sort((a,b)=>b.rank-a.rank);
 if(ranked[0]?.rank>0)return ranked.slice(0,2).filter(u=>u.rank===ranked[0].rank);
 if(parents.length===1)return parents;
 return [];
}
export function presentResults(corpus,result,question){
 const groups=[];
 for(const row of result.results){
  const entry=corpus.find(e=>e.doc.id===row.documentId);if(!entry)continue;
  let article=null;
  const number=row.heading?.match(/제\s*\d+\s*조(?:의\s*\d+)?/u)?.[0];
  if(number&&!(['form','table'].includes(row.kind)))article=articleIn(entry,clean(number),result.asOf);
  if(!article&&row.match==='정의 항목 일치'||!article&&row.match==='방역지역 정의 연결'){
   article=activeArticles(entry,result.asOf).find(a=>a.title==='정의'&&a.parts.some(p=>p.page===row.page&&p.text.includes(row.text)))||null;
   if(article)article=articleIn(entry,article.number,result.asOf);
  }
  const key=row.documentId+'|'+(row.sopKey||article?.number||row.heading)+'|'+(row.scenario||'')+'|'+(row.match.includes('정의')?row.heading:'');
  let group=groups.find(g=>g.key===key);
  if(!group){group={...row,key,doc:entry.doc,article,parts:[],fullParts:[],focus:[]};groups.push(group);}
  if(!group.parts.some(p=>p.page===row.page&&p.text===row.text))group.parts.push({page:row.page,text:row.text,display:row.display||readable(row.text)});
 }
 for(const g of groups){
  g.fullParts=uniqueParts(g.article?.parts||g.parts).map(p=>({page:p.page,text:p.text,display:p.display||readable(p.text)}));
  const location=g.article?locate(g.article,g.parts):null;
  g.locator=location?.label||g.article?.number||(['form','table'].includes(g.kind)?g.heading:g.sopKey?g.heading:'SOP 절차');
  if(g.docType!=='SOP'&&!g.article)g.locator=['form','table','figure'].includes(g.kind)?g.heading:'PDF '+g.page+'쪽 · 관련 후보';
  g.articleNumber=g.article?.number||null;g.articleTitle=g.article?.title||g.heading;
  g.target=g.article?{documentId:g.documentId,articleNumber:g.article.number,paragraph:location?.paragraph||null,item:location?.item||null}:null;
  g.focus=selectFocus(g,question,result.mode).map(u=>({label:u.label,note:u.note,paragraph:u.paragraph,item:u.item,parts:addRefs(u.parts,g.doc,corpus,g.target?{...g.target,paragraph:u.paragraph??g.target.paragraph,item:u.item??g.target.item}:null)}));
  if(g.focus.length===1){g.locator=g.focus[0].label;if(g.target&&g.focus[0].paragraph!==undefined)g.target={...g.target,paragraph:g.focus[0].paragraph,item:g.focus[0].item};}
  g.needsContext=g.docType==='SOP'&&g.focus.some(u=>/(?:아래|다음)[^.]{0,45}(?:검사|절차)/u.test(u.parts.map(p=>p.text).join(' ').replace(/\s+/gu,' ')));
  g.fullParts=addRefs(g.fullParts,g.doc,corpus);
  g.primary=result.mode==='procedure'?g.docType==='SOP':result.mode==='zone'?g.match==='방역지역 정의 연결':true;
  if(result.mode==='topic')g.primary=g.topicPrimary;
  if(result.mode==='material')g.primary=g.materialPrimary;
  if(result.mode==='ranked')g.primary=g.retrievalPrimary;
  if(g.match==='SOP 관련 후보')g.primary=false;
  if(result.mode==='related')g.primary=false;
  delete g.article;
 }
 if(!groups.some(g=>g.primary)&&!['related','ranked'].includes(result.mode))for(const g of groups)g.primary=true;
 return {groups,question,scope:questionIntent(question)};
}
export function articleDetail(corpus,target){
 const entry=corpus.find(e=>e.doc.id===target.documentId),article=entry&&articleIn(entry,target.articleNumber,target.asOf||entry.asOf||entry.doc.from);
 if(!article)return {error:'이 기준일에 게시된 해당 조문을 찾지 못했습니다.'};
 const {units}=legalUnits(article),selected=units.filter(u=>(!target.paragraph||u.paragraph===Number(target.paragraph))&&(target.item?u.item===Number(target.item):!target.paragraph||!u.item));
 const scope=selected.length===1?selected[0]:null;
 const citations=[];
 for(const e of corpus){
  if(e.doc.type==='SOP')continue;
  const seen=new Set();
  for(const a of activeArticles(e,target.asOf||e.asOf||e.doc.from)){
   if(seen.has(a.number)||e.doc.id===entry.doc.id&&a.number===article.number)continue;seen.add(a.number);
   for(const p of a.parts){
    const match=references(p.text,e.doc,corpus).find(r=>r.documentId===entry.doc.id&&r.articleNumber===article.number&&(!target.paragraph||!r.paragraph||r.paragraph===Number(target.paragraph))&&(!target.item||!r.item||r.item===Number(target.item)));
    if(match){citations.push({documentId:e.doc.id,articleNumber:a.number,title:e.doc.title,articleTitle:a.title,label:match.label});break;}
   }
  }
 }
 return {doc:entry.doc,number:article.number,title:article.title,target,scopeLabel:scope?.label||article.number,
  scope:scope?addRefs(scope.parts,entry.doc,corpus,target):[],
  parts:addRefs(article.parts.map(p=>({page:p.page,text:p.text,display:p.display||readable(p.text)})),entry.doc,corpus),
  citations,scopeMissing:Boolean((target.paragraph||target.item)&&!scope)};
}
