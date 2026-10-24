import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {search} from '../site/assets/search.js';
import {presentResults,articleIn,articleDetail,references} from '../site/assets/evidence.js';
const site=new URL('../site/',import.meta.url),m=JSON.parse(fs.readFileSync(new URL('data/manifest.json',site)));
const base=m.documents.map(doc=>({doc,index:JSON.parse(fs.readFileSync(new URL(doc.data,site)))}));
const corpus=(date='2026-10-24')=>base.map(e=>({...e,asOf:date}));
const run=(q,date='2026-10-24')=>{const c=corpus(date),r=search(c,q,{asOf:date,disease:'전체',type:'전체'});return {c,r,v:presentResults(c,r,q)};};
const law=base.find(e=>e.doc.type==='법률').doc;
test('definition has exact article/item locator and keeps the current article separate',()=>{
 const {v}=run('가축의 정의'),g=v.groups[0];assert.equal(g.locator,'제2조 제1호');assert.deepEqual(g.fullParts.map(p=>p.page),[4]);assert.equal(g.target.item,1);assert(!g.locator.includes('제1항'));
});
test('reporting destination focuses SOP 1.1 and folds supporting laws',()=>{
 const {v}=run('구제역이 발생하면 어디에 신고하나요?');const primary=v.groups.filter(g=>g.primary);assert.equal(primary.length,2);
 for(const g of primary){assert.equal(g.locator,'절차 1.1');const text=g.focus.flatMap(u=>u.parts).map(p=>p.text).join('');assert(text.includes('1588-4060'));assert(!text.includes('1.2'));assert(g.fullParts[0].text.includes('1.2'));}
 const legal=v.groups.find(g=>g.docType==='법률');assert(!legal.primary);assert.equal(legal.locator,'제11조 제1항');assert(legal.focus[0].parts.map(p=>p.text).join('').includes('다만'));
});
test('release procedure groups all pages by scenario without losing full context',()=>{
 const {v}=run('구제역 이동제한은 언제 풀리나요?'),sop=v.groups.filter(g=>g.docType==='SOP');assert.equal(sop.length,2);assert.deepEqual(sop.map(g=>g.fullParts.map(p=>p.page)),[[152,153,154],[280,281,282]]);assert(sop.every(g=>g.focus.length>0));
});
test('disinfection preview contains basic principles and preserves equipment in full context',()=>{
 const g=run('ASF 발생농장은 어떻게 소독하나요?').v.groups.find(g=>g.primary);assert.equal(g.fullParts.length,8);assert.equal(g.locator,'기본원칙');const t=g.focus[0].parts.map(p=>p.text).join('');assert(t.includes('주 2회'));assert(!t.includes('2. 기구'));assert(g.fullParts.some(p=>p.text.includes('기구 및 장비')));
});
test('a requested paragraph and item can be searched directly',()=>{
 const g=run('가축전염병 예방법 제11조제1항제2호').v.groups[0];assert.equal(g.locator,'제11조 제1항 제2호');assert(g.focus[0].parts[0].text.includes('전염성 질병'));assert(!g.focus[0].parts[0].text.includes('①'));
});
test('a two-page definition retains both page citations and adjustment conditions',()=>{
 const {c}=run('가축의 정의');const r=search(c,'예찰지역의 정의',{asOf:'2026-10-24',disease:'고병원성AI',type:'고시'}),g=presentResults(c,r,'예찰지역의 정의').groups[0];assert.equal(g.locator,'제2조 제6호');assert.deepEqual(g.focus[0].parts.map(p=>p.page),[2,3]);assert(g.focus[0].parts[1].text.includes('축소할 수 있다'));
});
test('cross-document reference resolves law article and item',()=>{
 const c=corpus(),decree=c.find(e=>e.doc.type==='시행령'),a=articleIn(decree,'제2조'),refs=references(a.parts[0].display,decree.doc,c);assert(refs.some(r=>r.documentId===law.id&&r.articleNumber==='제2조'&&r.item===1));
});
test('registered reverse citations connect the delegated animal scope',()=>{
 const detail=articleDetail(corpus(),{documentId:law.id,articleNumber:'제2조',item:1});assert.equal(detail.scopeLabel,'제2조 제1호');assert.equal(detail.scope.length,1);assert(detail.citations.some(c=>c.title.endsWith('시행령')&&c.articleNumber==='제2조'));assert(!detail.citations.some(c=>c.title.endsWith('시행규칙')&&c.articleNumber==='제2조'));
});
test('unregistered external acts and their same-law references remain unlinked',()=>{
 const c=corpus(),doc=c.find(e=>e.doc.type==='시행규칙').doc;
 const refs=references('「수의사법」 제21조 및 같은 법 제17조, 법 제11조제1항, 제9999조',doc,c);assert.equal(refs.length,1);assert.equal(refs[0].articleNumber,'제11조');
});
test('a same-law reference without a confirmed antecedent is not guessed',()=>{
 const c=corpus(),doc=c.find(e=>e.doc.type==='시행규칙').doc;assert.equal(references('같은 법 제17조',doc,c).length,0);
});
test('future clauses do not become current internal links',()=>{
 const c=corpus(),doc=c.find(e=>e.doc.type==='시행규칙').doc;assert.equal(references('법 제5조의5',doc,c).length,0);const future=corpus('2027-04-01');assert.equal(references('법 제5조의5',doc,future).length,1);
});
test('current and future article variants are selected at their stated dates',()=>{
 const before=articleDetail(corpus(),{documentId:law.id,articleNumber:'제2조',item:1}),after=articleDetail(corpus('2027-04-01'),{documentId:law.id,articleNumber:'제2조',item:1});assert.deepEqual(before.parts.map(p=>p.page),[4]);assert.deepEqual(after.parts.map(p=>p.page),[5]);assert.equal(after.scopeLabel,'제2조 제1호');
 assert.deepEqual(run('가축의 정의','2027-04-01').r.results.map(r=>r.page),[5]);
});
test('future-only articles cannot be searched before their effective date',()=>{
 assert.equal(run('가축전염병 예방법 제5조의5').r.results.length,0);assert(run('가축전염병 예방법 제5조의5','2027-04-01').r.results.length>0);
});
test('invalid target clauses do not fabricate a focused location',()=>{
 const detail=articleDetail(corpus(),{documentId:law.id,articleNumber:'제11조',paragraph:99});assert(detail.scopeMissing);assert.equal(detail.scope.length,0);assert.equal(detail.scopeLabel,'제11조');
});
test('every focused passage is an exact source substring and every link label matches its offsets',()=>{
 for(const q of ['가축의 정의','구제역이 발생하면 어디에 신고하나요?','AI 이동제한은 언제 풀리나요?','ASF 발생농장은 어떻게 소독하나요?','가축전염병 예방법 제11조제1항제2호']){
  const {c,v}=run(q);for(const g of v.groups){const pages=new Map(c.find(e=>e.doc.id===g.documentId).index.pages.map(p=>[p.page,p.text]));for(const p of [...g.fullParts,...g.focus.flatMap(u=>u.parts)]){assert(pages.get(p.page).includes(p.text));assert.equal(p.display.replace(/\s/gu,''),p.text.replace(/\s/gu,''));for(const r of p.references||[])assert.equal(p.display.slice(r.start,r.end),r.label);}}
 }
});

test('a verified delegation phrase links directly to its unique implementing article',()=>{
 const g=run('가축의 정의').v.groups[0];const links=g.focus.flatMap(u=>u.parts).flatMap(p=>p.references);assert(links.some(r=>r.kind==='delegation'&&r.articleNumber==='제2조'&&r.documentId===base.find(e=>e.doc.type==='시행령').doc.id));
});
test('a destination is not guessed for unregistered delegation wording',()=>{
 const c=corpus().filter(e=>e.doc.type!=='시행령'),r=search(c,'가축의 정의',{asOf:'2026-10-24',disease:'전체',type:'전체'});const g=presentResults(c,r,'가축의 정의').groups[0];assert(!g.focus.flatMap(u=>u.parts).flatMap(p=>p.references).some(r=>r.kind==='delegation'));
});

test('a where-to-report question previews destinations rather than symptom descriptions',()=>{
 const {v}=run('구제역이 발생하면 어디에 신고하나요?');for(const g of v.groups.filter(g=>g.primary)){const u=g.focus[0],text=u.parts.map(p=>p.text).join('');assert(text.startsWith('즉시'));assert(!text.includes('물집'));assert(u.note.includes('신고처만 발췌'));assert(g.fullParts[0].text.includes('물집'));}
});

test('culling keyword opens the legal basis and separates disease-specific rules',()=>{
 const {r,v}=run('살처분');assert.equal(r.mode,'topic');
 const primary=v.groups.filter(g=>g.primary);assert.equal(primary.length,1);
 assert.equal(primary[0].articleNumber,'제20조');assert.equal(primary[0].locator,'제20조 제1항');
 assert(primary[0].focus[0].parts.map(p=>p.text).join('').includes('명하여야'));
 assert(v.groups.some(g=>g.docType==='시행규칙'&&g.articleNumber==='제23조'));
 assert(!v.groups.some(g=>g.articleTitle.includes('참여자')));
});
for(const disease of ['구제역','ASF','고병원성AI'])test(disease+' culling keeps only that disease and common law',()=>{
 const {r,v}=run(disease+' 살처분 기준은 어떻게 되나요?');assert.equal(r.mode,'topic');
 assert(v.groups.every(g=>g.disease==='공통'||g.disease===disease));
 assert(v.groups.filter(g=>g.primary).every(g=>g.disease===disease));
 assert(v.groups.some(g=>g.primary&&g.focus.length));
 if(disease==='구제역')assert.equal(v.groups.filter(g=>g.primary).length,2);
});
test('specific compensation and definition requests are not relabelled as culling criteria',()=>{
 for(const q of ['살처분 보상금','살처분 참여자 지원','살처분의 정의','살처분 면제'])assert.notEqual(run(q).r.mode,'topic');
});
test('culling topic respects document filters',()=>{
 const c=corpus(),r=search(c,'살처분',{asOf:'2026-10-24',disease:'ASF',type:'고시'}),v=presentResults(c,r,'살처분');
 assert.equal(v.groups.length,1);assert.equal(v.groups[0].articleNumber,'제18조');assert(v.groups[0].primary);
});

test('outbreak feed question opens common disposal basis rather than unrelated sellers',()=>{
 const {r,v}=run('전염병 발생시 사료에 대한 조치');assert.equal(r.mode,'material');
 assert(v.groups.some(g=>g.primary&&g.docType==='법률'&&g.articleNumber==='제23조'));
 const rule=v.groups.find(g=>g.primary&&g.docType==='시행규칙');assert.equal(rule.locator,'제22조의3 제1호');
 const text=rule.focus[0].parts.map(p=>p.text).join('');assert(text.includes('10. 14.>'));assert(text.includes('법 제19조제1항제1호'));
 assert(!v.groups.some(g=>/신고|명예|벌칙|검역/u.test(g.articleTitle)));
 const law=v.groups.find(g=>g.articleNumber==='제23조'&&g.docType==='법률');assert(law.focus[1].parts[0].text.includes('옮기거나 세척하지 못한다'));
});
for(const disease of ['구제역','ASF','HPAI'])test(disease+' feed disposal preserves conditions and exceptions',()=>{
 const {v}=run(disease+' 발생농장 사료 처리');const primary=v.groups.filter(g=>g.primary);
 assert(primary.length);assert(primary.every(g=>g.docType==='고시'));
 assert(v.groups.every(g=>g.disease==='공통'||g.disease===(disease==='HPAI'?'고병원성AI':disease)));
 assert(primary.some(g=>g.focus.some(u=>u.parts.map(p=>p.text).join('').includes('소각'))));
 assert(primary.some(g=>g.focus.some(u=>/다만|제외/u.test(u.parts.map(p=>p.text).join('')))));
 if(disease==='구제역')assert.equal(primary.length,2);
});
test('feed supply routes to regional rules and preserves the parent geographic scope',()=>{
 const {v}=run('구제역 사료 공급 차량');const primary=v.groups.filter(g=>g.primary);assert(primary.length>=2);
 assert(primary.every(g=>/지역/u.test(g.articleTitle)));
 assert(primary.some(g=>g.focus.some(u=>u.parts.map(p=>p.text).join('').includes('지정된 차량'))));
 assert(primary.every(g=>g.focus.every(u=>u.parts.map(p=>p.text).join('').includes('지역'))));
});
test('feed specifics and exact article numbers are not overwritten by the feed topic',()=>{
 for(const q of ['사료 수입 검역','사료 판매자 신고','사료 폐기 보상','사료 사체 재활용','사료 제23조'])assert.notEqual(run(q).r.mode,'material');
});
test('feed excerpts and their parent conditions remain exact source substrings',()=>{
 const {c,v}=run('전염병 발생시 사료에 대한 조치');
 for(const g of v.groups)for(const u of g.focus)for(const p of u.parts){
  const original=c.find(e=>e.doc.id===g.documentId).index.pages.find(page=>page.page===p.page);
  assert(original.text.includes(p.text),g.title+' '+u.label);
 }
});
test('feed filters and effective dates are enforced',()=>{
 const c=corpus();for(const [disease,type,date] of [['ASF','고시','2026-10-24'],['전체','시행규칙','2026-10-01'],['ASF','고시','2020-01-01']]){
 const r=search(c,'사료 조치',{asOf:date,disease,type});
 assert(r.results.every(r=>r.docType===type&&(disease==='전체'||r.disease===disease||r.disease==='공통')&&r.from<=date));
 }
});
