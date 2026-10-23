import {eligible,search} from './search.js?v=20261024-1';
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
self.onmessage=async({data:{id,manifest,question,filters}})=>{
 try{const corpus=await Promise.all(manifest.documents.filter(d=>eligible(d,filters)).map(load));self.postMessage({id,result:search(corpus,question,filters,manifest.documents)});}
 catch(e){self.postMessage({id,error:e.message});}
};
