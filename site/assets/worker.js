import {eligible,search} from './search.js?v=20261024-14';
import {presentResults,articleDetail} from './evidence.js?v=20261024-14';
const loading=new Map();
async function load(doc){
 if(!loading.has(doc.id))loading.set(doc.id,(async()=>{
  const url=new URL('../'+doc.data,import.meta.url);url.searchParams.set('sha',doc.data_sha256);const response=await fetch(url);if(!response.ok)throw Error('문서 색인을 불러오지 못했습니다.');
  const bytes=await response.arrayBuffer();
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==doc.data_sha256)throw Error('문서 색인 무결성 검사에 실패했습니다. 새로고침해주세요.');
  return {doc,index:JSON.parse(new TextDecoder().decode(bytes))};
 })().catch(e=>{loading.delete(doc.id);throw e;}));
 return loading.get(doc.id);
}
self.onmessage=async({data:{id,action,manifest,question,filters,target}})=>{
 try{
  // Navigation can cross document-type filters, but must keep the same date.
  const loaded=await Promise.all(manifest.documents.filter(d=>eligible(d,{...filters,type:'전체',disease:'전체'})).map(load));
  const corpus=loaded.map(e=>({...e,asOf:filters.asOf}));
  if(action==='article'){self.postMessage({id,action,detail:articleDetail(corpus,target)});return;}
  const result=search(corpus,question,filters,manifest.documents);result.view=presentResults(corpus,result,question);
  self.postMessage({id,result});
 }catch(e){self.postMessage({id,action,error:e.message});}
};
