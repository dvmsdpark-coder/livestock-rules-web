// Presentation boundaries only: never rewrite, summarize, or discard source characters.
export const documentGroup=doc=>doc.type==='SOP'?'SOP':doc.type==='고시'?'고시':'법령';
export function sourceBlocks(text,sop=false){
 const cuts=new Map([[0,'paragraph']]);
 for(const m of text.matchAll(/(?:^|\n)[ \t]*(?:([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+[.． ]+|제\s*\d+\s*[장절]\s*)|(\d+(?:\.\d+)+\.?[ \t]+)|(\d{1,2}[.)](?!\d)[ \t]*|[가-힣]\.[ \t]*)|([-○◦▷▶][ \t]+)|(※[ \t]*))/gu)){
  const kind=m[1]?'heading':m[2]?'step':m[3]?'item':m[4]?'bullet':'note';cuts.set(m.index,kind);
 }
 if(sop){for(const m of text.matchAll(/(?:^|\n)[ \t]*(\d+(?:[.,]\d+)+)\.?(?=[ \t가-힣(「])/gu))cuts.set(m.index,'step');}
 for(const m of text.matchAll(/[①-⑳]/gu)){if(m.index===0||/[\s.)>]/u.test(text[m.index-1]))cuts.set(m.index,'clause');}
 const entries=[...cuts].sort((a,b)=>a[0]-b[0]);return entries.map(([start,kind],i)=>({start,end:entries[i+1]?.[0]??text.length,kind:sop&&kind==='paragraph'?'prose':kind,text:text.slice(start,entries[i+1]?.[0]??text.length)}));
}
