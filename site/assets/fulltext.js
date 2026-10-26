import {contents} from './reader-model.js?v=20261027-1';
export function literalRanges(text,query){
 const letters=[],offsets=[];for(let i=0;i<text.length;i++){if(/\s/u.test(text[i]))continue;letters.push(text[i].toLocaleLowerCase());offsets.push(i);}
 const needle=query.replace(/\s/gu,'').toLocaleLowerCase();if(!needle)return [];
 const value=letters.join(''),ranges=[];let from=0,at;while((at=value.indexOf(needle,from))>=0){ranges.push({start:offsets[at],end:offsets[at+needle.length-1]+1});from=at+needle.length;}return ranges;
}
export function fulltextSearch(corpus,query,documentId=null){
 if(!query.trim()||query.length>100)return [];
 const results=[];
 for(const entry of corpus){if(documentId&&entry.doc.id!==documentId)continue;const toc=contents(entry);
  const nodes=entry.doc.type==='SOP'?toc.pages:[...toc.articles,...toc.annexes];
  for(const node of nodes){let match=null,count=0;for(const part of node.parts){const ranges=literalRanges(part.text,query);count+=ranges.length;if(!match&&ranges.length)match={part,range:ranges[0]};}if(!match)continue;
   let key=node.key,label=node.label;if(entry.doc.type==='SOP'){const section=toc.articles.find(n=>n.parts.some(p=>p.page===match.part.page&&literalRanges(p.text,query).length));if(section){key=section.key;label=section.label;}}
   const {text}=match.part,{start,end}=match.range,a=Math.max(0,start-60),b=Math.min(text.length,end+95);
   results.push({documentId:entry.doc.id,title:entry.doc.title,type:entry.doc.type,disease:entry.doc.disease,key,label,page:match.part.page,count,snippet:text.slice(a,b),match:{start:start-a,end:end-a}});
  }
 }
 return results;
}
