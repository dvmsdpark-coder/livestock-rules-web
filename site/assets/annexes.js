// Resolve only substantive, unambiguous annexes of the selected PDF revision.
const clean=s=>s.replace(/[\s「」『』·ㆍ]/gu,'');
export function actualAnnexes(index){
 const groups=new Map();
 for(const a of index.annexes||[]){
  // A one-line appendix list is not the actual table/form. Deleted markers are
  // retained as source information, but never substituted for a live table.
  if(!a.deleted&&clean(a.part.text).length<100&&(index.annexes||[]).filter(b=>b.part.page===a.part.page).length>1)continue;
  const key=a.kind+':'+a.number.join(':');
  const group=groups.get(key)||[];if(!group.some(b=>b.part.page===a.part.page))group.push(a);groups.set(key,group);
 }
 return [...groups.values()].flatMap(g=>g.length===1?g:[]);
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
