// Display only text proven against the selected immutable PDF revision.
const compact=s=>s.replace(/[\s\x00]/gu,'');
export function nativePage(data,doc,page){const d=data?.documents?.[doc.id];return d?.source_sha256===doc.sha256?d.pages[String(page)]||null:null;}
export function nativeSpacing(part,page){
 if(!page)return null;const text=page.lines.map(l=>l.text).join('\n'),needle=compact(part.text),chars=[],positions=[];
 for(let i=0;i<text.length;i++)if(!/[\s\x00]/u.test(text[i])){chars.push(text[i]);positions.push(i);}
 const value=chars.join('');if(!needle)return null;const matches=[];let at=value.indexOf(needle);while(at>=0){matches.push(text.slice(positions[at],positions[at+needle.length-1]+1));at=value.indexOf(needle,at+1);}return matches.length&&new Set(matches).size===1?matches[0]:null;
}
export function nativeReadingBlocks(page,range,number,label='',chapter=''){
 if(!page)return null;if(page.divider)return [];const low=range&&number===range.startPage?range.top*page.height:0,high=range&&number===range.endPage?range.bottom*page.height:page.height,inside=b=>(b[1]+b[3])/2>=low-.5&&(b[1]+b[3])/2<high-.5;
 const result=[];
 for(const block of page.blocks||[]){
  if(block.kind!=='text'){if(inside(block.sourceBox))result.push(structuredClone(block));continue;}
  const lines=block.lines.filter(l=>inside(l.box)&&![label,chapter].some(h=>h&&compact(h)===compact(l.text)));
  const gaps=lines.slice(1).map((l,i)=>l.box[1]-lines[i].box[1]).filter(v=>v>0&&v<50).sort((a,b)=>a-b),normal=gaps.length?gaps[Math.floor(gaps.length/2)]:18;let run=[];
  const finish=()=>{if(!run.length)return;result.push({kind:'text',text:run.map(l=>l.text).join('\n'),sourceBox:[Math.min(...run.map(l=>l.box[0])),run[0].box[1],Math.max(...run.map(l=>l.box[2])),run.at(-1).box[3]]});run=[];};
  const heading=l=>/^\s*(?:\d+(?:\.\d+)*[. ]|[가-힣]\.)\s*\S/u.test(l.text)&&l.text.length<110&&!/(?:다[.!?]?|[.!?。])$/u.test(l.text.trim());
  for(const [i,l] of lines.entries()){const next=lines[i+1],isHeading=heading(l)&&(l.text.length<30||!next||heading(next)||next.box[1]-l.box[1]>normal*1.22);if(run.length&&(l.box[1]-run.at(-1).box[1]>normal*1.22||isHeading))finish();run.push(l);if(isHeading)finish();}finish();
 }
 return result.sort((a,b)=>a.sourceBox[1]-b.sourceBox[1]);
}
// Preserve exact reference ownership when spacing changes; never let a shorter
// article number claim the beginning of a longer inserted article number.
export function remapNativeReferences(text,part){
 const source=part.display||part.text,src=[],dst=[];for(let i=0;i<source.length;i++)if(!/\s/u.test(source[i]))src.push(i);for(let i=0;i<text.length;i++)if(!/\s/u.test(text[i]))dst.push(i);
 const a=src.map(i=>source[i]).join(''),b=dst.map(i=>text[i]).join(''),at=b?a.indexOf(b):-1,refs=part.references||[];
 if(at>=0&&a.indexOf(b,at+1)<0){
  const before=x=>{let low=0,high=src.length;while(low<high){const mid=(low+high)>>1;if(src[mid]<x)low=mid+1;else high=mid;}return low;};
  return refs.flatMap(r=>{const first=before(r.start)-at,last=before(r.end)-at;if(first<0||last>dst.length||first>=last)return [];const start=dst[first],end=dst[last-1]+1;return [{...r,start,end,label:text.slice(start,end)}];});
 }
 const result=[],key=r=>[r.documentId,r.articleNumber,r.annexKind,r.number,r.paragraph,r.item].join(':');
 for(const r of [...refs].sort((x,y)=>compact(y.label).length-compact(x.label).length)){
  if(refs.some(other=>compact(other.label)===compact(r.label)&&key(other)!==key(r)))continue;
  const pattern=[...compact(r.label)].map(c=>c.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')).join('\\s*');if(!pattern)continue;
  for(const m of text.matchAll(new RegExp(pattern,'gu'))){const start=m.index,end=start+m[0].length;if(result.some(x=>start<x.end&&end>x.start))continue;const tail=text.slice(end);if(/(?:조|항|호)$/u.test(compact(r.label))&&/^\s*의\s*\d/u.test(tail)||/\d$/u.test(compact(r.label))&&/^\s*\d/u.test(tail))continue;result.push({...r,start,end,label:text.slice(start,end)});}
 }
 return result.sort((x,y)=>x.start-y.start);
}
