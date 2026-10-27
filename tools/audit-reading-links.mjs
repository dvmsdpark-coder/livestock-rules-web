import fs from 'node:fs';import assert from 'node:assert/strict';
import {contents} from '../site/assets/reader-model.js';
import {eligible} from '../site/assets/search.js';
import {references,articleIn,legalUnits} from '../site/assets/evidence.js';
const asOf=process.env.READER_AUDIT_DATE||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const manifest=JSON.parse(fs.readFileSync('site/data/manifest.json')),corpus=manifest.documents.filter(doc=>eligible(doc,{asOf,disease:'전체',type:'전체'})).map(doc=>({doc,index:JSON.parse(fs.readFileSync('site/'+doc.data)),asOf}));
const rows=[],issues=[],unresolved=[];let candidates=0,resolved=0;
for(const entry of corpus){let total=0,linked=0;const nodes=contents(entry);
 for(const node of [...nodes.articles,...nodes.annexes]){
  const text=node.parts.map(p=>p.text).join('\n'),audit=[],refs=references(text,entry.doc,corpus,audit),quotes=[...text.matchAll(/「[^」]*」|『[^』]*』/gu)];
  for(const m of text.matchAll(/제\s*\d+\s*조(?:\s*의\s*\d+)?|같은\s*(?:조|항)|(?<![가-힣A-Za-z0-9])동\s*(?:조|항)/gu)){
   if(quotes.some(q=>m.index>=q.index&&m.index<q.index+q[0].length))continue;
   if(!audit.some(a=>m.index>=a.start&&m.index+m[0].length<=a.end))issues.push({document:entry.doc.title,item:node.label,text:m[0],reason:'unclassified citation'});
  }
  for(const a of audit){if(a.reason==='heading')continue;total++;candidates++;if(a.reason!=='resolved')unresolved.push({document:entry.doc.title,item:node.label,label:a.label,reason:a.reason});}
  for(const r of refs){assert.equal(text.slice(r.start,r.end),r.label);const e=corpus.find(e=>e.doc.id===r.documentId),a=e&&articleIn(e,r.articleNumber);assert(a,'Missing article');assert(!r.paragraph||legalUnits(a).units.some(u=>u.paragraph===r.paragraph));linked++;resolved++;}
 }
 rows.push({document:entry.doc.title,items:nodes.articles.length+nodes.annexes.length,candidates:total,linked});
}
const reasons={};for(const r of unresolved)reasons[r.reason]=(reasons[r.reason]||0)+1;
const report={schema:1,asOf,documents:rows,candidates,resolved,unresolvedReasons:reasons,issues,unresolved};fs.writeFileSync('docs/reading-link-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({documents:rows.length,candidates,resolved,unresolvedReasons:reasons,issues:issues.slice(0,20)},null,2));assert.equal(issues.length,0,'Unclassified article citations');
