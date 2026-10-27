import test from 'node:test';import assert from 'node:assert/strict';
import {nativeReadingBlocks,nativeSpacing,nativePage,remapNativeReferences}from'../site/assets/reading-native.js';
test('native lines are cut by section coordinates, not the physical page',()=>{const page={height:800,blocks:[{kind:'text',lines:[{text:'앞 절의 마지막 문장',box:[50,100,500,115]},{text:'4 새 절 제목',box:[50,200,500,215]},{text:'새 절의 본문입니다.',box:[50,230,500,245]}]}]};const first=nativeReadingBlocks(page,{startPage:1,top:0,endPage:1,bottom:.25},1,'3 앞 절'),next=nativeReadingBlocks(page,{startPage:1,top:.25,endPage:2,bottom:0},1,'4 새 절 제목');assert.equal(first.map(b=>b.text).join(''),'앞 절의 마지막 문장');assert.equal(next.map(b=>b.text).join(''),'새 절의 본문입니다.');});
test('native spacing requires a unique unchanged character sequence',()=>{const p={lines:[{text:'살처분 및 사체처리 현장에 동원된 자에 대한'}]};assert.equal(nativeSpacing({text:'살처분및사체처리현장에동원된자에대한'},p),p.lines[0].text);assert.equal(nativeSpacing({text:'없는 내용'},p),null);assert.equal(nativePage({documents:{x:{source_sha256:'old',pages:{1:p}}}},{id:'x',sha256:'new'},1),null);});
test('short native subsection headings are separated from body paragraphs',()=>{const p={height:800,blocks:[{kind:'text',lines:[{text:'1. 목적',box:[50,100,500,114]},{text:'살처분 및 사체처리 현장에 동원된 자에 대한',box:[50,120,500,134]},{text:'회복을 목적으로 한다.',box:[50,140,500,154]},{text:'2. 트라우마 예방 및 안전교육',box:[50,170,500,184]}]}]};const b=nativeReadingBlocks(p,null,1);assert.equal(b[0].text,'1. 목적');assert(b[1].text.includes('현장에 동원된'));assert.equal(b[2].text,'2. 트라우마 예방 및 안전교육');});


test('native spacing maps exact citation spans rather than matching article-number prefixes',()=>{
 const source='법 제17조 및 제17조의6',short=source.indexOf('제17조'),long=source.lastIndexOf('제17조'),part={text:source,references:[{start:short,end:short+4,label:'제17조',documentId:'law',articleNumber:'제17조'},{start:long,end:source.length,label:'제17조의6',documentId:'law',articleNumber:'제17조의6'}]},text='법 제17조\n및 제17조의6';
 assert.deepEqual(remapNativeReferences(text,part).map(r=>[r.label,r.articleNumber]),[['제17조','제17조'],['제17조의6','제17조의6']]);
 const reordered='다른 셀 제17조의6';assert.deepEqual(remapNativeReferences(reordered,part).map(r=>r.articleNumber),['제17조의6']);
});
test('ambiguous native fragments cannot link a bare number to a guessed document',()=>{const text='제11조',part={text:'제11조 제11조',references:[{start:0,end:4,label:text,documentId:'law',articleNumber:text},{start:5,end:9,label:text,documentId:'notice',articleNumber:text}]};assert.deepEqual(remapNativeReferences(text,part),[]);});
