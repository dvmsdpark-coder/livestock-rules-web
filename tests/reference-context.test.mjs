import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {references,referencesForParts,articleIn,articleDetail} from '../site/assets/evidence.js';
const manifest=JSON.parse(fs.readFileSync(new URL('../site/data/manifest.json',import.meta.url))),corpus=manifest.documents.map(doc=>({doc,index:JSON.parse(fs.readFileSync(new URL('../site/'+doc.data,import.meta.url))),asOf:'2026-10-27'}));
const law=corpus.find(e=>e.doc.type==='법률'),decree=corpus.find(e=>e.doc.type==='시행령'),source=id=>corpus.find(e=>e.doc.id===id);
const gold=[
 ['e6d52b81-681d-5e59-aa4c-63e78798e41e',[[law.doc.id,'제3조',5],[law.doc.id,'제5조의2',null],[law.doc.id,'제13조',null],[law.doc.id,'제15조',null],[law.doc.id,'제16조',1],[law.doc.id,'제17조',null],[law.doc.id,'제17조의6',null],[law.doc.id,'제19조',null],[law.doc.id,'제20조',null],[law.doc.id,'제51조',null]]],
 ['1dce0635-63a4-5b58-b3a0-63cd313ed189',[[law.doc.id,'제49조',null],[decree.doc.id,'제12조의2',null],[law.doc.id,'제19조',1],[law.doc.id,'제19조',2]]],
 ['73aa19cc-15fb-5758-8a8c-10cc64ab8085',[[law.doc.id,'제20조',null],[law.doc.id,'제21조',null],[law.doc.id,'제23조',null],[law.doc.id,'제48조',null],[law.doc.id,'제49조',null],[decree.doc.id,'제11조',null],[decree.doc.id,'제12조',null]]],
];
for(const [id,expected] of gold)test('purpose citations resolve every listed and relative provision: '+id,()=>{
 const e=source(id),parts=articleIn(e,'제1조').parts,text=parts.map(p=>p.text).join('\n'),r=references(text,e.doc,corpus);
 assert.deepEqual(r.map(r=>[r.documentId,r.articleNumber,r.paragraph]),expected);
 for(const ref of r){assert.equal(text.slice(ref.start,ref.end),ref.label);assert.notEqual(ref.documentId,e.doc.id);}
 const detail=articleDetail(corpus,{documentId:id,articleNumber:'제1조'});assert.equal(detail.parts.flatMap(p=>p.references).length,expected.length);
});
test('citation lists and relative clauses keep scope across physical page parts',()=>{
 const e=source('73aa19cc-15fb-5758-8a8c-10cc64ab8085'),parts=[{page:1,text:'「가축전염병 예방법」 제20조,'},{page:2,text:'제21조 및 제23조에 따른 조치. 「가축전염병 예방법」 제19조제1항 또는 같은 조 제2항에 따른다.'}];
 const out=referencesForParts(parts,e.doc,corpus);assert.deepEqual(out.flatMap(p=>p.references).map(r=>r.articleNumber),['제20조','제21조','제23조','제19조','제19조']);assert(out.flatMap(p=>p.references).every(r=>r.documentId===law.doc.id));
 for(const p of out)for(const r of p.references)assert.equal(p.text.slice(r.start,r.end),r.label);
});
test('unregistered acts block their complete citation list and the following relative citation',()=>{
 const e=source('73aa19cc-15fb-5758-8a8c-10cc64ab8085');assert.equal(references('「수의사법」 제3조, 제4조 및 같은 법 시행령 제11조, 제12조 또는 같은 조 제2항',e.doc,corpus).length,0);
 assert.equal(references('같은 조 제2항',e.doc,corpus).length,0);
 const r=references('「가축전염병 예방법」 제20조에 따른 조치가 있다. 제3조에 따라 실시한다.',e.doc,corpus);assert.equal(r[1].documentId,e.doc.id);
});
test('same-law derived acts work with line breaks and quoted names attached to particles',()=>{
 const e=source('1dce0635-63a4-5b58-b3a0-63cd313ed189');const r=references('고시는「가축전염병 예방법」 제49조와 같은 법\n시행령 제12조\n의2에 따른다.',e.doc,corpus);assert.deepEqual(r.map(r=>[r.documentId,r.articleNumber]),[[law.doc.id,'제49조'],[decree.doc.id,'제12조의2']]);
});
test('reverse citations include provisions formerly lost after commas',()=>{
 const d=articleDetail(corpus,{documentId:law.doc.id,articleNumber:'제51조'});assert(d.citations.some(c=>c.documentId===gold[0][0]&&c.articleNumber==='제1조'));
});
test('parenthetical citations cannot replace the enclosing article and qualifier lists retain their scope',()=>{
 const a=articleIn(law,'제57조'),r=references(a.parts.map(p=>p.text).join('\n'),law.doc,corpus);
 assert(r.some(r=>r.label==='같은 조 제2항'&&r.articleNumber==='제19조'&&r.paragraph===2));
 assert(r.some(r=>r.label==='제4항'&&r.articleNumber==='제22조'&&r.paragraph===4));
 const d=articleIn(decree,'제14조의2'),refs=references(d.parts.map(p=>p.text).join('\n'),decree.doc,corpus);assert(refs.some(r=>r.articleNumber==='제50조'&&r.documentId===law.doc.id&&r.paragraph===1));
});
test('wrapped external law titles and attachment numbers are never mistaken for current-document articles',()=>{
 const e=source('e6d52b81-681d-5e59-aa4c-63e78798e41e');assert.equal(references('「축산계열화사업에 관한\n법률」 제2조제5호',e.doc,corpus).length,0);assert.equal(references('기동조치팀과 공동조사 및 별지 제1호의2서식을 확인한다.',e.doc,corpus).length,0);
});
test('the implicit first paragraph of a single-paragraph article can resolve a cited item',()=>{
 const e=source('e6d52b81-681d-5e59-aa4c-63e78798e41e'),r=references('제13조제1항제2호',e.doc,corpus);assert.equal(r.length,1);assert.equal(r[0].articleNumber,'제13조');assert.equal(r[0].item,2);assert.equal(r[0].paragraph,null);
});
