// Resolve only substantive, unambiguous annexes of the selected PDF revision.
const clean=s=>s.replace(/[\s「」『』·ㆍ]/gu,'');
const annexCache=new WeakMap();
// Some SOPs print standalone attachment labels without enclosing brackets.
// Recover only within the explicitly marked appendix division, stopping before
// reference material (which can reproduce another regulation's attachments).
function standaloneAnnexes(index){
 const pages=index.pages||[],start=pages.findIndex(p=>/^\s*별\s*표\s*\/\s*별\s*지(?:\s|⚫)/u.test(p.text));if(start<0)return [];
 const tail=pages.findIndex((p,i)=>i>start&&/^\s*참\s*고\s*자\s*료(?:\s|⚫)/u.test(p.text)),scope=pages.slice(start,tail<0?undefined:tail),found=[];
 for(const page of scope)for(const m of page.text.matchAll(/^[ \t]*(별표|별지)[ \t]*(?:제[ \t]*)?(\d+)(?:[ \t]*호[ \t]*의[ \t]*(\d+)|[ \t]*의[ \t]*(\d+)[ \t]*호?|[ \t]*호)?[ \t]*(서식)?[ \t]*$/gmu)){
  if(m[1]==='별지'&&!m[5])continue;
  const title=page.text.slice(m.index+m[0].length).split('\n').find(s=>s.trim())?.trim();
  if(!title||title.length>120||/^(?:\d+[.)]|[①-⑳])/u.test(title))continue;
  const kind=m[1]==='별표'?'table':'form',number=[m[2],m[3]||m[4]||null],text=page.text.slice(m.index).trim();
  found.push({kind,number,heading:'['+m[0].trim()+'] '+title,deleted:false,part:{page:page.page,text,display:text.replace(/\s+/gu,' '),origin:'pdf',kind:kind==='table'?'table':'form'}});
 }
 const last=scope.findLast(p=>p.text.trim())?.page;
 return found.map((a,i)=>({...a,endPage:(found[i+1]?.part.page??last+1)-1}));
}
export function actualAnnexes(index){
 if(annexCache.has(index))return annexCache.get(index);
 const registered=index.annexes||[],annexes=[...registered,...standaloneAnnexes(index).filter(a=>!registered.some(b=>b.kind===a.kind&&b.number.join(':')===a.number.join(':')&&b.part.page===a.part.page))];
 const groups=new Map();
 for(const a of annexes){
  // A one-line appendix list is not the actual table/form. Deleted markers are
  // retained as source information, but never substituted for a live table.
  if(!a.deleted&&clean(a.part.text).length<100&&annexes.filter(b=>b.part.page===a.part.page).length>1)continue;
  const key=a.kind+':'+a.number.join(':');
  const group=groups.get(key)||[];if(!group.some(b=>b.part.page===a.part.page))group.push(a);groups.set(key,group);
 }
 const candidates=[...groups.values()].flatMap(g=>g.length===1?g:[]);
 const inline=a=>/^[^\n]*[\]〕〉]\s*(?:에\s*따[라른]|에서|의\s*(?:규정|기준))/u.test(a.part.text.split('\n')[0]);
 const selected=candidates.map((a,i)=>({...a,readerOrdinal:i})).filter(a=>!inline(a));
 const beginsPage=a=>{const page=index.pages.find(p=>p.page===a.part.page),first=a.part.text.split('\n').find(s=>s.trim());const at=page?.text.indexOf(first);return at>=0&&/^[\s\d−–-]*$/u.test(page.text.slice(0,at));};
 const result=selected.map((a,i)=>{const next=selected.slice(i+1).find(b=>b.part.page>a.part.page);if(!next||!beginsPage(next))return a;const removedBoundary=candidates.some(b=>inline(b)&&b.part.page===a.endPage);if(a.endPage===next.part.page||removedBoundary)return {...a,endPage:next.part.page-1};return a;});annexCache.set(index,result);return result;
}
const pattern=/(?<![가-힣A-Za-z0-9])(?:(「[^」]{1,100}」|『[^』]{1,100}』|가축전염병\s*예방법(?:\s*시행(?:령|규칙))?|시행령|시행규칙|같은\s*(?:법|영|규칙)|이\s*(?:법|영|규칙)|법|영|규칙)\s*)?(별표|별지)\s*(?:제\s*)?(\d+)(?:\s*호\s*의\s*(\d+)|\s*의\s*(\d+)\s*호?|\s*호)?\s*(?:서식)?/gu;
export function annexReferences(text,sourceDoc,corpus){
 const refs=[];
 for(const m of text.matchAll(pattern)){
  const prefix=clean(m[1]||''),kind=m[2]==='별표'?'table':'form',number=[m[3],m[4]||m[5]||null];
  let candidates;
  if(!prefix)candidates=corpus.filter(e=>e.doc.id===sourceDoc.id);
  else if(['법','이법','영','이영','시행령','규칙','이규칙','시행규칙'].includes(prefix)){
   const type=['법','이법'].includes(prefix)?'법률':['영','이영','시행령'].includes(prefix)?'시행령':'시행규칙';
   candidates=corpus.filter(e=>e.doc.type===type&&e.doc.disease==='공통');
  }else candidates=corpus.filter(e=>clean(e.doc.title)===prefix);
  if(candidates.length!==1)continue;
  const entry=candidates[0],matches=actualAnnexes(entry.index).filter(a=>!a.deleted&&a.kind===kind&&a.number[0]===number[0]&&(a.number[1]||null)===number[1]);
  if(matches.length!==1)continue;
  const a=matches[0];refs.push({kind:'annex',start:m.index,end:m.index+m[0].trimEnd().length,label:m[0].trimEnd(),documentId:entry.doc.id,page:a.part.page,endPage:a.endPage,annexKind:kind,number});
 }
 return refs;
}
