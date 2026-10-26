import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {proseAnnex,previewPage} from '../site/assets/annex-presentation.js';
import {actualAnnexes} from '../site/assets/annexes.js';
const root=new URL('../site/',import.meta.url),m=JSON.parse(fs.readFileSync(new URL('data/manifest.json',root)));
test('reviewed prose includes pig facilities annex and revision changes cannot inherit classification',()=>{const d=m.documents.find(d=>d.type==='시행규칙'),x=JSON.parse(fs.readFileSync(new URL(d.data,root))),a=actualAnnexes(x).find(a=>a.number[0]==='1'&&a.number[1]==='2');assert(proseAnnex(d,a));assert(!proseAnnex({...d,sha256:'new-revision'},a));assert(!proseAnnex(d,{...a,kind:'form'}));});
test('page preview must match original PDF hash and physical page',()=>{const doc={id:'d',sha256:'correct'},data={documents:{d:{source_sha256:'correct',pages:{55:{path:'assets/pages/correct/55.webp'}}}}};assert(previewPage(data,doc,55));assert.equal(previewPage(data,{...doc,sha256:'changed'},55),null);assert.equal(previewPage(data,doc,56),null);assert.equal(previewPage(null,doc,55),null);});

test('generated annex layouts require the matching PDF and complete annex pages',async()=>{const {annexLayouts}=await import('../site/assets/annex-presentation.js');const doc={id:'d',sha256:'v1'},annex={kind:'table',part:{page:2},endPage:3},data={documents:{d:{source_sha256:'v1',pages:{2:{mode:'text'},3:{mode:'mixed',blocks:[]}}}}};assert.equal(annexLayouts(data,doc,annex).length,2);assert.equal(annexLayouts(data,{...doc,sha256:'v2'},annex),null);assert.equal(annexLayouts(data,doc,{...annex,endPage:4}),null);assert.equal(annexLayouts(data,doc,{...annex,kind:'form'}),null);});

test('annex body does not repeat its selected heading or remove substantive rules',async()=>{const {withoutAnnexHeading}=await import('../site/assets/annex-presentation.js');const title='■ 가축전염병 예방법 시행규칙 [별표 1의9] · 역학조사관 교육ㆍ훈련(제16조의2 관련)';assert.equal(withoutAnnexHeading('■ 가축전염병 예방법 시행규칙 [별표 1의9]\n역학조사관 교육ㆍ훈련(제16조의2 관련)\n1. 일반기준\n가. 교육을 실시한다.',title),'1. 일반기준\n가. 교육을 실시한다.');assert.equal(withoutAnnexHeading('[시행일: 2026. 4. 23.]\n1. 기준',title),'[시행일: 2026. 4. 23.]\n1. 기준');});

test('continued table cells join only when source boundaries and the complete grid agree',async()=>{const {joinedAnnexLayouts}=await import('../site/assets/annex-presentation.js');const table=(text,top,bottom)=>({kind:'table',columns:2,xs:[0,50,100],widths:[50,50],rows:[[{col:0,colspan:1,rowspan:1,text,openTop:top,openBottom:bottom},{col:1,colspan:1,rowspan:1,text:'나',openTop:top,openBottom:bottom}]]});const pages=[{page:1,mode:'mixed',blocks:[table('전',false,true)]},{page:2,mode:'mixed',blocks:[table('후',true,false)]}];const joined=joinedAnnexLayouts(pages);assert.equal(joined[0].blocks[0].rows.length,1);assert.equal(joined[0].blocks[0].rows[0][0].text,'전\n후');assert.deepEqual(joined[0].blocks[0].pages,[1,2]);assert.equal(joined[1].blocks.length,0);assert.equal(pages[0].blocks[0].rows[0][0].text,'전');const closed=structuredClone(pages);for(const c of closed[1].blocks[0].rows[0])c.openTop=false;assert.equal(joinedAnnexLayouts(closed)[1].blocks.length,1);});
test('partial-column continuation extends its source rowspan without swallowing new rows',async()=>{const {joinedAnnexLayouts}=await import('../site/assets/annex-presentation.js');const cell=(col,text,top,bottom)=>({col,text,rowspan:1,colspan:1,openTop:top,openBottom:bottom});const make=rows=>({kind:'table',columns:2,xs:[0,50,100],widths:[50,50],rows});const r=joinedAnnexLayouts([{page:1,mode:'mixed',blocks:[make([[cell(0,'소',false,true),cell(1,'질병1',false,false)]])]},{page:2,mode:'mixed',blocks:[make([[cell(0,'',true,false),cell(1,'질병2',false,false)]])]}]);const table=r[0].blocks[0];assert.equal(table.rows.length,2);assert.equal(table.rows[0][0].rowspan,2);assert.equal(table.rows[1][0].text,'질병2');});

test('new numbered items on the next page stay separate and only their common reference continues',async()=>{const {joinedAnnexLayouts}=await import('../site/assets/annex-presentation.js');const cell=(col,text,top,bottom)=>({col,text,colspan:1,rowspan:1,openTop:top,openBottom:bottom});const table=rows=>({kind:'table',xs:[0,30,60,100],columns:3,widths:[30,30,40],rows});const joined=joinedAnnexLayouts([{page:1,mode:'mixed',blocks:[table([[cell(0,'4) 대상4',false,true),cell(1,'법 제12조',false,true),cell(2,'업무정지 7일',false,true)]])]},{page:2,mode:'mixed',blocks:[table([[cell(0,'5) 대상5',true,false),cell(1,'',true,false),cell(2,'경고',true,false)]])]}]);const result=joined[0].blocks[0];assert.equal(result.rows.length,2);assert.equal(result.rows[0][1].rowspan,2);assert.equal(result.rows[0][2].text,'업무정지 7일');assert.equal(result.rows[1][1].text,'경고');});

test('printed book page numbers before a verified annex heading never become body or title text',async()=>{
 const {withoutAnnexHeading}=await import('../site/assets/annex-presentation.js');const title='[별표 3] · 의심축 및 의사환축 발생농장 시료채취, 송부 및 진단 요령';
 for(const prefix of ['188\n[별표 3]\n','188 [별표 3] '])assert.equal(withoutAnnexHeading(prefix+'의심축 및 의사환축 발생농장 시료채취, 송부 및 진단 요령\n1. 시료채취반 준비',title),'1. 시료채취반 준비');
 assert.equal(withoutAnnexHeading('188\n1. 보상 기준',title),'188\n1. 보상 기준');assert.equal(withoutAnnexHeading('1. 기준\n188\n2. 기준',title),'1. 기준\n188\n2. 기준');
});

test('HPAI SOP annex 3 fixture strips printed page 188 but preserves its numbered procedure',async()=>{
 const {contents}=await import('../site/assets/reader-model.js'),{withoutAnnexHeading}=await import('../site/assets/annex-presentation.js');
 const doc=m.documents.find(d=>d.id==='3d9ae693-1bb3-5f8c-af9e-0e3512252566'),index=JSON.parse(fs.readFileSync(new URL(doc.data,root))),annex=contents({doc,index}).annexes.find(n=>n.key==='x:2');
 assert.match(annex.parts[0].text,/^188\n/u);const cleaned=withoutAnnexHeading(annex.parts[0].text,annex.label);assert.match(cleaned,/^1\. 시/u);assert.match(cleaned,/1\.1 시료채취반/u);assert(!cleaned.includes('188'));
});

test('native prose replaces whitespace-free legacy extraction but selected units never expand into a whole page',async()=>{
 const {annexProseText}=await import('../site/assets/annex-presentation.js');const text='1. 지원 기준\n가. 지원 대상: 사육 농가\n나. 지원 범위\n1) 출하 지연 농가\n2) 정상 입식 지연 농가',layout={mode:'text',text};
 assert.deepEqual(annexProseText(text.replace(/\s/gu,''),layout,true),{text,nativeLines:true,nativePage:true});
 const slice=annexProseText('1)출하지연농가',layout);assert.equal(slice.text,'1) 출하 지연 농가');assert(slice.nativeLines);assert(!slice.nativePage);assert(!slice.text.includes('2)'));
 const missing='알 수 없는 항목';assert.deepEqual(annexProseText(missing,layout),{text:missing,nativeLines:false,nativePage:false});
 const ambiguous=annexProseText('지원 기준',{mode:'text',text:'지원 기준\n지원 기준'});assert(!ambiguous.nativeLines);assert.equal(ambiguous.text,'지원 기준');
});

test('split annex titles with a related-article suffix are displayed once without dropping substantive criteria',async()=>{
 const {withoutAnnexHeading}=await import('../site/assets/annex-presentation.js');
 for(const [label,source] of [['[별표 1의2] 도태 보상금 지급기준','[별표1의2]\n도태 보상금 지급기준(제3조제2항관련)'],['[별표 2] 도태 장려금 지급기준','[별표 2]\n도태 장려금 지급기준(제9조제2항 관련)'],['[별표 3] 생계안정비용 지원기준 등','[별표 3]\n생계안정비용 지원기준 등(제13조 관련)']])assert.equal(withoutAnnexHeading(source+'\n1. 실제 기준\n□ 지급 대상을 정한다.',label),'1. 실제 기준\n□ 지급 대상을 정한다.');
});
