import {activeArticles} from './provisions.js?v=20261026-1';
import {actualAnnexes,annexReferences} from './annexes.js?v=20261027-5';
import {sopIndex} from './sop-index.js?v=20261027-5';
import {articleDetail,referencesForParts} from './evidence.js?v=20261027-5';
import {annexUnits} from './annex-excerpts.js?v=20261026-1';
export function contents(entry){
 const articles=entry.doc.type==='SOP'?sopIndex(entry).readerSections.map(s=>({key:'s:'+s.readerOrdinal,aliases:s.aliases,label:s.heading,chapter:s.scenario,parts:s.parts,headingPage:s.headingPage,headingTop:s.headingTop})):activeArticles(entry).map(a=>({key:'a:'+a.number,label:a.number+' '+a.title,chapter:a.parts[0]?.scenario||'',parts:a.parts,number:a.number}));
 const annexes=actualAnnexes(entry.index).map((a,i)=>({key:'x:'+(a.readerOrdinal??i),label:a.heading,annexKind:a.kind,number:a.number,annex:a,parts:entry.index.pages.filter(p=>p.page>=a.part.page&&p.page<=a.endPage)}));
 const pages=entry.index.pages.map(p=>({key:'p:'+p.page,label:'PDF '+p.page+'쪽',parts:[p]}));
 return {articles,annexes,pages};
}
export function readerDetail(corpus,documentId,key){
 const requestedKey=key;key=key.replace(/^v:/u,'p:');
 const entry=corpus.find(e=>e.doc.id===documentId);if(!entry)return {error:'이 기준일에 수록된 문서를 찾지 못했습니다.'};
 const nodes=Object.values(contents(entry)).flat(),node=nodes.find(n=>n.key===key)||nodes.find(n=>n.aliases?.includes(key));if(!node)return {error:'목차에서 항목을 다시 선택해주세요.'};key=node.key;
 if(node.key.startsWith('a:')){const d=articleDetail(corpus,{documentId,articleNumber:node.number,asOf:entry.asOf});return {...d,label:node.label,key};}
 const parts=referencesForParts(node.parts.map(p=>({...p,display:p.display||p.text})),entry.doc,corpus);
 const sections=entry.doc.type==='SOP'?contents(entry).articles:[],position=sections.findIndex(n=>n.key===key),last=parts.at(-1)?.page;
 const sourceRange=position>=0?{start:parts[0].page,end:Math.max(last,(sections[position+1]?.parts[0]?.page||last+1)-1)}:null;
 const next=sections[position+1],visualRange=position>=0&&node.headingTop!=null?{startPage:node.headingPage,top:node.headingTop,endPage:next?.headingPage??sourceRange.end+1,bottom:next?.headingTop??0}:null;
 return {doc:entry.doc,key:requestedKey.startsWith('v:')?requestedKey:key,visualOnly:requestedKey.startsWith('v:'),label:node.label,chapter:node.chapter,sourceRange,visualRange,parts,citations:[],annex:node.annex,units:node.annex?annexUnits(entry,node.annex):[]};
}
