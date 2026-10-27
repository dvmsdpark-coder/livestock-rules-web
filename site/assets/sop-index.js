// Build searchable SOP sections from approved body text; preserve physical-page substrings.
import {sopStructure} from './sop-structure.js?v=20261027-4';
const compact=s=>s.replace(/\s/gu,'');
const cache=new WeakMap();
const readable=s=>s.replace(/([^\n])\n(?!\s*(?:\d+(?:\.\d+)*[. ]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]|[가-힣]\.\s|[-▷※]))/gu,'$1 ').trim();
export function sopIndex(entry){
 if(cache.has(entry.index))return cache.get(entry.index);
 const sections=[],vocabulary=new Set();let chapter='',current=null,unit=null,excludedTail=false;
 const finish=()=>{if(current?.parts.length)sections.push(current);current=null;unit=null;};
 const add=(page,text)=>{if(!text.trim())return;
  if(/발생상황\s*위기단계\s*주요\s*조치사항/u.test(text))current.layout='table';const part={page,text,display:readable(text)};current.parts.push(part);
  if(!unit){unit={label:'본문',parts:[]};current.units.push(unit);}unit.parts.push(part);
 };
 for(const page of entry.index.pages){
  const sidebar=page.text.match(/^\s*([ⅣⅤ])\s*(?:백\s*신\s*)?(미\s*)?접\s*종\s*행\s*동\s*요\s*령/u);
  if(sidebar){const label=sidebar[1]+' 백신'+(sidebar[2]?'미접종':'접종')+' 행동요령';if(label!==chapter){finish();chapter=label;}}
  const body=entry.index.chunks.filter(c=>c.page===page.page&&c.kind==='body');
  if(!body.length){finish();continue;}
  if((page.text.match(/[·․.]{5,}/gu)||[]).length>3){finish();continue;}
  if(/(?:^\s*참\s*고\s*자\s*료|^\s*별\s*표\s*\/\s*별\s*지|^\s*제1조\s*\(목적)/mu.test(page.text.slice(0,550))){excludedTail=true;finish();}
  if(excludedTail)continue;
  // Union overlapping body chunks, leaving excluded forms/figures and appendices out.
  const ranges=body.map(c=>({start:page.text.indexOf(c.text),end:page.text.indexOf(c.text)+c.text.length})).filter(r=>r.start>=0).sort((a,b)=>a.start-b.start);
  const merged=[];for(const r of ranges){const last=merged.at(-1);if(last&&r.start<=last.end)last.end=Math.max(last.end,r.end);else merged.push({...r});}
  for(const range of merged){
   const text=page.text.slice(range.start,range.end);
   if((text.match(/[·․.]{5,}/gu)||[]).length>3){finish();continue;} // contents page
   const lines=[...text.matchAll(/[^\n]+/gu)].filter(m=>m[0].trim().length>=3);
   const chapterLine=lines.slice(0,4).find(m=>/^제\s*\d+\s*장/u.test(m[0].trim()));
   if(chapterLine){const label=chapterLine[0].trim();if(label!==chapter){finish();chapter=label;}}
   const first=lines.slice(0,5).find(m=>/^\s*\d{1,2}[ .]+[가-힣A-Za-z].{2,95}$/u.test(m[0])&&!/^\s*\d+\.\d/u.test(m[0])&&!/[·․.]{5,}/u.test(m[0])&&m[0].length<80&&/(?:요령|사항|조치|원칙|관리|처리|설정|운영|방법|검사|소독|절차|예찰|실시|대응|진단|방역|제한|해제|지원|계획|체계|정의|개요)(?:[)）]| 등)?$/u.test(m[0].trim()));
   if(first){finish();current={key:entry.doc.id+':sop:'+page.page+':'+(range.start+first.index),heading:first[0].trim(),scenario:chapter,parts:[],units:[]};}
   if(!current)current={key:entry.doc.id+':sop:'+page.page+':'+range.start,heading:chapter||'SOP 본문',scenario:chapter,parts:[],units:[]};
   const markers=[...text.matchAll(/(?:^|\n)[ \t]*((?:\d+(?:\.\d+){1,4})\.?[ \t]+[^\n]{1,110}|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+[.．][ \t]*[^\n]{1,100})/gu)];
   let offset=0;
   for(const m of markers){add(page.page,text.slice(offset,m.index));unit={label:/^\d/u.test(m[1])?'절차 '+m[1].match(/^\d+(?:\.\d+)+/u)[0]:m[1].trim(),parts:[]};current.units.push(unit);offset=m.index;}
   add(page.page,text.slice(offset));
   for(const raw of text.match(/[가-힣]{2,}/gu)||[]){
    const word=raw.replace(/(?:에서는|에서|으로|에게|까지|부터|이란|에는|은|는|을|를|의|이|가|시)$/u,'');
    if(word.length>=2&&word.length<=20)vocabulary.add(word);
   }
  }
 }
 finish();
 const value={sections:sections.filter(s=>s.parts.some(p=>p.text.trim())),vocabulary};value.readerSections=readerSections(entry,value.sections);cache.set(entry.index,value);return value;
}

// Reading follows source typography. Keep the legacy search index independent,
// and redirect old child-section links to their enclosing source section.
function readerSections(entry,legacy){
 const source=sopStructure[entry.doc.sha256];if(!source)return legacy.map((s,i)=>({...s,readerOrdinal:i,aliases:[]}));
 const out=[];let current=null;
 const chapterAt=page=>(source.chapters||[]).findLast(c=>c.page<=page);
 const display=(text,page)=>{for(const c of source.chapters||[])if(c.page===page)text=text.replace(needle(c.heading),'');return text||' ';};
 const needle=s=>new RegExp([...compact(s)].map(c=>c.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')).join('\\s*'),'u');
 // Retain previously generated addresses when adding missing subdivisions.
 const originalOrdinals=new Map();let originalCount=0,originalStarted=false;
 for(const old of legacy)for(const part of old.parts){let at=0;for(const h of source.headings.filter(h=>!h.subsection&&h.page===part.page).map(h=>({...h,match:needle(h.heading).exec(part.text)})).filter(h=>h.match).sort((a,b)=>a.match.index-b.match.index)){if(!originalStarted&&part.text.slice(at,h.match.index).trim()){originalCount++;originalStarted=true;}originalOrdinals.set(h.page+':'+compact(h.heading),1000+originalCount++);originalStarted=true;at=h.match.index;}if(!originalStarted&&part.text.slice(at).trim()){originalCount++;originalStarted=true;}}
 for(const old of legacy)for(const part of old.parts){
  const chapter=chapterAt(part.page),scenario=chapter?.heading||old.scenario;
  const headings=source.headings.filter(h=>h.page===part.page).map(h=>({...h,match:needle(h.heading).exec(part.text)})).filter(h=>h.match).sort((a,b)=>a.match.index-b.match.index);
  if(chapter?.page===part.page&&!headings.length&&(!current||current.scenario!==scenario))headings.push({...chapter,virtual:true,match:{index:0,0:chapter.heading}});
  let at=0;
  const add=text=>{if(!text.trim())return;if(!current){current={...old,scenario,parts:[],units:[],aliases:[]};out.push(current);}current.parts.push({...part,text,display:display(text,part.page)});};
  for(const h of headings){const prefix=part.text.slice(at,h.match.index),transfer=at===0&&current&&current.parts.at(-1)?.page<part.page;if(!transfer)add(prefix);current={...old,key:entry.doc.id+':reader:'+h.page+':'+h.match.index,generatedOrdinal:originalOrdinals.get(h.page+':'+compact(h.heading))??2000+out.length,scenario,heading:h.heading.trim(),headingPage:h.page,headingTop:h.topRatio,parts:[],units:[],aliases:[]};out.push(current);if(transfer)add(prefix);at=h.match.index;}
  add(part.text.slice(at));
 }
 if(out.length>1&&(out[0].heading==='SOP 본문'||out[0].heading===out[0].scenario&&/^[-\s\d]*$/u.test(out[0].parts.map(p=>p.text).join('')))&&out[0].parts.every(p=>p.page===out[1].headingPage)&&compact(out[0].parts.map(p=>p.text).join('')).length<200){const prefix=out.shift();out[0].parts.unshift(...prefix.parts);}
 const starts=out.map(s=>({page:s.parts[0].page,offset:entry.index.pages.find(p=>p.page===s.parts[0].page).text.indexOf(s.parts[0].text)}));
 for(let i=0;i<legacy.length;i++){
  const old=legacy[i],page=old.parts[0].page,pageText=entry.index.pages.find(p=>p.page===page).text,offset=needle(old.heading).exec(pageText)?.index??pageText.indexOf(old.parts[0].text);
  const exact=out.findIndex(s=>s.parts[0].page===page&&compact(s.heading)===compact(old.heading));
  let position=0;for(let n=0;n<starts.length;n++)if(starts[n].page<page||starts[n].page===page&&starts[n].offset<=offset)position=n;if(exact>=0)position=exact;
  const owner=out[position];owner.aliases.push('s:'+i);owner.readerOrdinal??=i;
 }
 for(let i=0;i<out.length;i++){out[i].readerOrdinal??=out[i].generatedOrdinal??1000+i;if(out[i].generatedOrdinal!=null&&out[i].generatedOrdinal!==out[i].readerOrdinal)out[i].aliases.push('s:'+out[i].generatedOrdinal);out[i].units=[{label:'본문',parts:out[i].parts}];}
 return out;
}


