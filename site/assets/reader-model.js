import {activeArticles} from './provisions.js?v=20261025-3';
import {actualAnnexes,annexReferences} from './annexes.js?v=20261025-3';
import {sopIndex} from './sop-index.js?v=20261025-3';
import {articleDetail,references} from './evidence.js?v=20261025-3';
import {annexUnits} from './annex-excerpts.js?v=20261025-3';
export function contents(entry){
 const articles=entry.doc.type==='SOP'?sopIndex(entry).sections.map((s,i)=>({key:'s:'+i,label:s.heading,chapter:s.scenario,parts:s.parts})):activeArticles(entry).map(a=>({key:'a:'+a.number,label:a.number+' '+a.title,chapter:a.parts[0]?.scenario||'',parts:a.parts,number:a.number}));
 const annexes=actualAnnexes(entry.index).map((a,i)=>({key:'x:'+i,label:a.heading,annexKind:a.kind,number:a.number,annex:a,parts:entry.index.pages.filter(p=>p.page>=a.part.page&&p.page<=a.endPage)}));
 const pages=entry.index.pages.map(p=>({key:'p:'+p.page,label:'PDF '+p.page+'쪽',parts:[p]}));
 return {articles,annexes,pages};
}
export function readerDetail(corpus,documentId,key){
 const entry=corpus.find(e=>e.doc.id===documentId);if(!entry)return {error:'이 기준일에 수록된 문서를 찾지 못했습니다.'};
 const node=Object.values(contents(entry)).flat().find(n=>n.key===key);if(!node)return {error:'목차에서 항목을 다시 선택해주세요.'};
 if(node.key.startsWith('a:')){const d=articleDetail(corpus,{documentId,articleNumber:node.number,asOf:entry.asOf});return {...d,label:node.label,key};}
 const parts=node.parts.map(p=>({...p,display:p.text,references:[...references(p.text,entry.doc,corpus),...annexReferences(p.text,entry.doc,corpus)].sort((a,b)=>a.start-b.start)}));
 return {doc:entry.doc,key,label:node.label,parts,citations:[],annex:node.annex,units:node.annex?annexUnits(entry,node.annex):[]};
}
