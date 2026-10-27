import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {contents,readerDetail} from '../site/assets/reader-model.js';
import {sopIndex} from '../site/assets/sop-index.js';
const root=new URL('../site/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('data/manifest.json',root)));
const corpus=manifest.documents.map(doc=>({doc,index:JSON.parse(fs.readFileSync(new URL(doc.data,root))),asOf:'2026-10-25'}));
test('FMD opens the definition rather than an empty furniture-only SOP item and preserves old addresses',()=>{
 const e=corpus.find(e=>e.doc.id==='de2a0c26-cb9d-4f83-b3f9-4d31f29fbbef'),nodes=contents(e).articles;assert(!nodes.some(n=>n.label==='SOP 본문'));
 const d=readerDetail(corpus,e.doc.id,'s:0'),old=readerDetail(corpus,e.doc.id,'s:1001'),pathogen=readerDetail(corpus,e.doc.id,'s:1002');assert.match(d.label,/^1\s*정\s*의/u);assert.equal(old.key,d.key);assert.match(pathogen.label,/^2\s*병원체/u);assert.equal(d.visualRange.endPage,9);assert(d.visualRange.bottom<.5);assert(pathogen.visualRange.top>=d.visualRange.bottom);
});
test('SOP reading headings follow source hierarchy and preserve all approved source characters',()=>{
 for(const e of corpus.filter(e=>e.doc.type==='SOP')){const s=sopIndex(e),clean=x=>x.replace(/\s/gu,'');assert.equal(clean(s.readerSections.flatMap(s=>s.parts.map(p=>p.text)).join('')),clean(s.sections.flatMap(s=>s.parts.map(p=>p.text)).join('')));for(const n of s.readerSections)for(const p of n.parts)assert(e.index.pages.find(x=>x.page===p.page).text.includes(p.text));}
 const f=corpus.find(e=>e.doc.disease==='구제역'&&e.doc.type==='SOP'),nodes=contents(f).articles;
 assert(!nodes.some(n=>/^3\.\s*소독방법/u.test(n.label)));
 const a=nodes.find(n=>n.parts[0].page===254);assert.match(a.label,/^15\s/u);assert(a.parts.some(p=>p.page===255&&p.text.includes('3. 소독방법')));
 const d=readerDetail(corpus,f.doc.id,'s:54');assert.equal(d.key,a.key);assert.equal(d.sourceRange.end,255);
 const missing=nodes.find(n=>n.parts[0].page===280);assert.match(missing.label,/^23\s/u);assert.equal(readerDetail(corpus,f.doc.id,'s:64').key,missing.key);
 const asf=corpus.find(e=>e.doc.disease==='ASF'&&e.doc.type==='SOP');assert(contents(asf).articles.some(n=>n.parts[0].page===168&&/^18\./u.test(n.label)));
});
test('reader exposes every physical page including figures and blank pages',()=>{for(const e of corpus){const c=contents(e);assert.equal(c.pages.length,e.index.pages.length);assert.equal(new Set(Object.values(c).flat().map(n=>n.key)).size,Object.values(c).flat().length);for(const n of c.pages){const d=readerDetail(corpus,e.doc.id,n.key);assert.equal(d.parts[0].text,e.index.pages.find(p=>'p:'+p.page===n.key).text);}}});
test('reader resolves substantive decree annex 2 and exact compensation floor units',()=>{const e=corpus.find(e=>e.doc.type==='시행령'),a=contents(e).annexes.find(n=>n.number[0]==='2'&&!n.number[1]);assert(a);const d=readerDetail(corpus,e.doc.id,a.key);assert(d.units.some(u=>u.parts.some(p=>/100분의 20/u.test(p.text))));assert(d.parts.every(p=>p.page>=a.annex.part.page&&p.page<=a.annex.endPage));});
test('reader legal detail retains exact source and resolved outgoing and incoming references',()=>{const e=corpus.find(e=>e.doc.type==='법률'),d=readerDetail(corpus,e.doc.id,'a:제48조');assert(!d.error);assert(d.citations.some(c=>c.documentId!==e.doc.id));for(const p of d.parts){assert(e.index.pages.find(x=>x.page===p.page).text.includes(p.text));for(const r of p.references){assert(corpus.some(x=>x.doc.id===r.documentId));assert(r.start>=0&&r.end<=(p.display||p.text).length);}}});
test('reader respects embedded future effective dates and does not fabricate unavailable documents',()=>{const e=corpus.find(e=>e.doc.type==='법률'),old={...e,asOf:'2026-10-25'},future={...e,asOf:'2027-12-31'};assert(contents(old).articles.length>0);assert(contents(future).articles.length>0);assert(readerDetail(corpus,'missing','a:제1조').error);assert(readerDetail(corpus,e.doc.id,'a:제999조').error);});
test('cropped visual addresses and complete physical-page addresses remain distinct',()=>{const e=corpus.find(e=>e.doc.type==='SOP'&&e.doc.disease==='구제역'),a=readerDetail(corpus,e.doc.id,'v:45'),b=readerDetail(corpus,e.doc.id,'p:45');assert(a.visualOnly);assert(!b.visualOnly);assert.equal(a.key,'v:45');assert.equal(b.key,'p:45');assert.deepEqual(a.parts,b.parts);});
test('SOP source spans include interstitial image-only pages without changing section addresses or text',()=>{for(const e of corpus.filter(e=>e.doc.type==='SOP')){const nodes=contents(e).articles;for(let i=0;i<nodes.length;i++){const n=nodes[i],d=readerDetail(corpus,e.doc.id,n.key);assert.equal(d.parts.map(p=>p.text).join(''),n.parts.map(p=>p.text).join(''));assert.equal(d.sourceRange.start,n.parts[0].page);assert(d.sourceRange.end>=n.parts.at(-1).page);assert(d.sourceRange.end<=e.doc.pages);if(nodes[i+1])assert(d.sourceRange.end<Math.max(nodes[i+1].parts[0].page,n.parts.at(-1).page+1));}}});

test('SOP appendix ranges stop before the next appendix rather than displaying it twice',()=>{for(const e of corpus.filter(e=>e.doc.type==='SOP')){const list=contents(e).annexes;for(let i=0;i<list.length-1;i++){const a=list[i],next=list[i+1];if(next.parts[0].text.trimStart().startsWith(next.annex.part.text.split('\n')[0]))assert(a.annex.endPage<next.annex.part.page,a.label);}}});
test('inline legal annex citations are not catalogued as new SOP appendices and later addresses remain stable',()=>{const e=corpus.find(e=>e.doc.id==='3d9ae693-1bb3-5f8c-af9e-0e3512252566'),list=contents(e).annexes;assert(!list.some(n=>n.number[0]==='1'&&n.number[1]==='10'));const a=list.find(n=>n.number[0]==='14'&&!n.number[1]);assert.equal(a.annex.endPage,289);const later=list.find(n=>n.number[0]==='15'&&!n.number[1]);assert.equal(later.key,'x:'+later.annex.readerOrdinal);assert(later.annex.readerOrdinal>list.indexOf(later));assert(readerDetail(corpus,e.doc.id,later.key).label.includes('소독제'));});


test('ASF chapters use physical source headings even when PDF text places them after the body',()=>{
 const e=corpus.find(e=>e.doc.type==='SOP'&&e.doc.disease==='ASF'),nodes=contents(e).articles;
 assert(!nodes.some(n=>n.label==='SOP 본문'));
 assert.deepEqual([...new Set(nodes.map(n=>n.chapter.match(/^제\d+장/u)?.[0]))],['제1장','제2장','제3장']);
 const first=readerDetail(corpus,e.doc.id,'s:0');assert.match(first.label,/^1\.1\s*정/u);assert.match(first.chapter,/^제1장/u);assert(first.parts.some(p=>p.text.includes('출혈열')));assert(!first.parts.some(p=>p.display.includes('제1장')));
 for(let i=1;i<=10;i++)assert(nodes.some(n=>new RegExp('^1\\.'+i+'\\s','u').test(n.label)));
 const phases=nodes.filter(n=>/단\s*계$/u.test(n.label));assert.equal(phases.length,3);assert(phases.every(n=>n.chapter.startsWith('제2장')));
 const emergency=nodes.filter(n=>n.chapter.startsWith('제3장'));assert.equal(emergency.length,22);assert.deepEqual(emergency.map(n=>Number(n.label.match(/^\d+/u)[0])),Array.from({length:22},(_,i)=>i+1));
 assert.match(readerDetail(corpus,e.doc.id,'s:1').label,/^1\./u);assert.equal(readerDetail(corpus,e.doc.id,'s:1001').key,readerDetail(corpus,e.doc.id,'s:1').key);
});

test('HPAI last table excludes the following forms divider but keeps its illustrated continuation',()=>{
 const e=corpus.find(e=>e.doc.id==='3d9ae693-1bb3-5f8c-af9e-0e3512252566'),a=contents(e).annexes.find(n=>n.annexKind==='table'&&n.number[0]==='23'),d=readerDetail(corpus,e.doc.id,a.key);
 assert.equal(a.annex.endPage,316);assert.deepEqual(d.parts.map(p=>p.page),[315,316]);assert(!d.parts.some(p=>p.text.includes('현지조사표')));assert(contents(e).pages.some(n=>n.key==='p:317'));
});


test('SOP reading preserves physical line breaks for source-furniture masks and nested paragraphs',()=>{
 for(const e of corpus.filter(e=>e.doc.type==='SOP'))for(const n of contents(e).articles)for(const p of n.parts){
  assert.equal((p.display.match(/\n/gu)||[]).length,(p.text.match(/\n/gu)||[]).length,'PDF '+p.page);
 }
});
