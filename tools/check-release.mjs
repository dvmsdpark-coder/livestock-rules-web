// CI checks both the historical baseline and all published revision cutover dates.
import fs from 'node:fs';import path from 'node:path';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {integrity} from './validate-update.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),site=path.join(root,'site');
const issues=integrity(site);if(issues.length)throw Error(issues.join('\n'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'maintenance/catalog.json'),'utf8'));
const dates=new Set([catalog.baseline_as_of]);const approved=[];
const releases=path.join(root,'maintenance/releases');
if(fs.existsSync(releases))for(const file of fs.readdirSync(releases).filter(f=>f.endsWith('.json'))){
 const receipt=JSON.parse(fs.readFileSync(path.join(releases,file),'utf8'));
 if(receipt.status==='rolled_back')continue;
 if(!receipt.checks_passed||!/^\d{4}-\d{2}-\d{2}$/u.test(receipt.from))throw Error('Invalid revision receipt: '+file);
 const manifest=JSON.parse(fs.readFileSync(path.join(site,'data/manifest.json'),'utf8'));
 if(!manifest.documents.some(d=>d.family===receipt.family&&d.sha256===receipt.after_sha256&&d.from===receipt.from))throw Error('Published revision is missing: '+file);
 const profile=JSON.parse(fs.readFileSync(path.join(root,'maintenance/profiles',receipt.after_sha256+'.json'),'utf8'));
 if(profile.source_sha256!==receipt.after_sha256)throw Error('Source profile mismatch: '+file);
 approved.push(receipt);dates.add(receipt.from);
}
const manifest=JSON.parse(fs.readFileSync(path.join(site,'data/manifest.json'),'utf8'));
for(const d of manifest.documents)if(!catalog.documents.some(row=>row.baseline?.id===d.id)&&!approved.some(r=>r.family===d.family&&r.after_sha256===d.sha256&&r.from===d.from))throw Error('Missing reviewed update receipt: '+d.title+' '+d.from);
const reportBase=path.join(root,'private/release-checks');fs.mkdirSync(reportBase,{recursive:true});
const reports=fs.mkdtempSync(path.join(reportBase,'run-'));
for(const asOf of dates){
 const reportDir=path.join(reports,asOf);fs.mkdirSync(reportDir);
 for(const tool of ['evaluate.mjs','audit-regulation-links.mjs','audit-questions.mjs']){
  const r=spawnSync(process.execPath,[path.join(root,'tools',tool)],{cwd:root,env:{...process.env,LIVESTOCK_AS_OF:asOf,LIVESTOCK_SITE_ROOT:site,LIVESTOCK_REPORT_DIR:reportDir},encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
  if(r.status!==0){process.stderr.write((r.stdout||'')+(r.stderr||''));throw Error('Revision regression failed: '+asOf+' '+tool);}
 }
}
console.log('PASS published snapshot integrity and '+dates.size+' baseline/cutover date(s)');
