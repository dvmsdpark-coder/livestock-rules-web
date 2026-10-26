import test from 'node:test';import assert from 'node:assert/strict';
import {documentGroup,sourceBlocks} from '../site/assets/reader-format.js';
test('category navigation distinguishes law, notices and SOP',()=>{for(const type of ['법률','시행령','시행규칙'])assert.equal(documentGroup({type}),'법령');assert.equal(documentGroup({type:'고시'}),'고시');assert.equal(documentGroup({type:'SOP'}),'SOP');});
test('formatting preserves every original character and reference span while splitting legal clauses',()=>{const text='제10조(자격) ① 자격은 다음과 같다.\n1. 법 제8조제1항의 사람\n2. 관련 자격\n② 교육을 받아야 한다.';const b=sourceBlocks(text);assert.equal(b.map(x=>x.text).join(''),text);assert.equal(b.filter(x=>x.kind==='clause').length,2);assert.equal(b.filter(x=>x.kind==='item').length,2);const start=text.indexOf('제8조제1항');assert(b.some(x=>start>=x.start&&start+'제8조제1항'.length<=x.end));});
test('SOP procedure hierarchy, bullets and notes retain exact PDF text',()=>{const text='Ⅲ. 발생 시 행동요령\n3.2 농림축산검역본부\n3.2.1 상황실 운영\n  - 연락체계 유지\n※ 세부 기준 확인\n  3.2.1.1 기관에 통보';const b=sourceBlocks(text,true);assert.equal(b.map(x=>x.text).join(''),text);assert(b.some(x=>x.kind==='heading'));assert.equal(b.filter(x=>x.kind==='step').length,3);assert(b.some(x=>x.kind==='bullet'));assert(b.some(x=>x.kind==='note'));});
test('SOP run-together step numbers start separate rows without changing OCR source',()=>{const text='6. 이행상황 점검\n6.1 지자체에서는 점검한다.\n 6.2축산관련작업장 출입구\n 6.3돼지·차량 출입금지\n8,1 돼지농장\n8.1.1 농장 조치';const b=sourceBlocks(text,true);assert.equal(b.map(x=>x.text).join(''),text);assert.equal(b.filter(x=>x.kind==='step').length,5);assert(b.some(x=>x.text.trimStart().startsWith('6.2축산')));assert(b.some(x=>x.text.trimStart().startsWith('6.3돼지')));assert(b.some(x=>x.text.trimStart().startsWith('8,1')));});

test('inline annex siblings and nested items become separate rows at increasing depths',()=>{
 const text='2. 매몰기준 가. 매몰 장소의 선택 1) 발생 장소에 매몰한다. 2) 크기를 결정한다. 가) 매몰 수량 나) 주변 환경 다) 종류ㆍ크기 3) 적합한 장소 가) 수원지와 떨어진 곳 사) 다음 구역 제외 (1) 상수원보호구역 (2) 보전구역';
 const blocks=sourceBlocks(text),items=blocks.filter(b=>b.marker);
 assert.deepEqual(items.map(b=>b.marker),['2.','가.','1)','2)','가)','나)','다)','3)','가)','사)','(1)','(2)']);
 assert.deepEqual(items.map(b=>b.depth),[0,1,2,2,3,3,3,2,3,3,4,4]);assert.equal(blocks.map(b=>b.text).join(''),text);
});
test('table cells restart their own hierarchy and numbered children stay inside parenthesized Korean items',()=>{
 const text='(가) 소독기 설치 (나) 신발 소독 (사) 다음 기준 1) 각 출입구에 설치 2) 실내 공간에 설치 3) 교차오염 방지';
 const b=sourceBlocks(text,false,{mode:'cell'}).filter(b=>b.marker);assert.deepEqual(b.map(b=>b.depth),[0,0,0,1,1,1]);assert.equal(b.map(b=>b.text).join(''),text);
});
test('page continuations retain outline level without changing citations, quantities or line-wrapped sentence endings',()=>{
 const state={};sourceBlocks('2. 기준 가. 선택 2) 고려사항 가) 매몰 수량',false,state);
 const text='나) 주변 환경 다) 종류와 크기 3) 장소 사) 제외구역 (1) 기준 (2) 그 밖에 (1)부터 (4)까지의 구역. 1.5미터 이상 설치한다.\n다.\n2. 새 기준';
 const b=sourceBlocks(text,false,state);assert.deepEqual(b.filter(b=>b.marker).map(b=>b.marker),['나)','다)','3)','사)','(1)','(2)','2.']);assert.equal(b.find(b=>b.marker==='나)').depth,3);assert.equal(b.map(b=>b.text).join(''),text);
});
test('SOP inline steps split but dimensions, dates and protected reference labels remain intact',()=>{
 const text='6. 점검 6.1 시설 점검 6.2 출입 통제 6.3 농장 관리. 1.5미터와 0.2㎜ 기준. 2026. 4. 23. 개정';
 const b=sourceBlocks(text,true);assert.deepEqual(b.filter(b=>b.marker).map(b=>b.marker),['6.','6.1','6.2','6.3']);assert.equal(b.map(b=>b.text).join(''),text);
 const reference='별표 2 제1호 가. 기준';const span={start:0,end:reference.length};assert.equal(sourceBlocks(reference,false,{},[span]).length,1);
});

test('a new parent starts a fresh branch even when its child uses a different numbering family',()=>{
 const text='2. 매몰기준 가. 장소 1) 선정 사) 제외 (1) 구역 나. 사체의 매몰 (1) 매몰 방법 (가) 구덩이 (나) 바닥';
 const b=sourceBlocks(text).filter(b=>b.marker);assert.deepEqual(b.map(b=>b.depth),[0,1,2,3,4,1,2,3,3]);
});
