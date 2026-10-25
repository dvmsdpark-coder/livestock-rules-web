// Qualifications are substantive appointment requirements, not review deadlines.
import {activeArticles} from './provisions.js?v=20261025-2';
import {legalUnits} from './evidence.js?v=20261025-2';
export const qualificationRequest=q=>/자격|위촉요건|임명요건|위촉조건/u.test(q.replace(/\s/gu,''))&&!/재검토|재검토기한|규제검토/u.test(q.replace(/\s/gu,''));
export function qualificationRetrieval(entries,question,asOf){
 const q=question.replace(/\s/gu,''),titles=[...new Set(entries.filter(e=>e.doc.type!=='SOP').flatMap(e=>activeArticles(e,asOf).map(a=>a.title)))];
 const actor=titles.filter(t=>/^[가-힣]{3,30}$/u.test(t)&&/(?:관|사|사업자|책임자)$/u.test(t)&&q.includes(t)).sort((a,b)=>b.length-a.length)[0];
 const hits=[];
 if(actor)for(const entry of entries.filter(e=>e.doc.type!=='SOP'))for(const article of activeArticles(entry,asOf).filter(a=>a.title===actor)){
  const scopes=legalUnits(article).units.filter(u=>!u.item).filter(u=>/자격|위촉할\s*수\s*있는\s*사람|교육과정.*(?:마친|이수)/su.test(u.parts.map(p=>p.text).join(' '))).map(u=>({paragraph:u.paragraph,item:null}));
  if(scopes.length)hits.push({doc:entry.doc,article,scopes,score:100,matched:[actor,'자격']});
 }
 return {status:hits.length?'matched':'no_match',qualificationSearch:true,anchors:actor?[actor,'자격']:['자격'],hits,sopHits:[],supplement:[]};
}
