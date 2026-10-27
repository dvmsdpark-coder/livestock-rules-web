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

test('circled population bands inside an annex note remain local children and never reset the following parent outline',()=>{
 const text='2. 시험가축의 선정\n다. 종류 및 마리수\n2) 최소 5수 이상\n※ 축사 규모별 시험축 ① 2만 수 이하(5수 이상), ② 2만 수～5만 수(10수 이상),\n③ 5만 수～10만 수(20수 이상), ④ 10만 수 이상(30수 이상)\n3) 재입식 시험가축 배치\n3. 입식시험의 방법\n가. 발생농장의 입식시험';
 const b=sourceBlocks(text,false,{mode:'annex'}),rows=b.filter(b=>b.marker),parent=rows.find(b=>b.marker==='2)'),note=rows.find(b=>b.marker==='※'),bands=rows.filter(b=>/[①-④]/u.test(b.marker));
 assert.equal(bands.length,4);assert(bands.every(b=>b.kind==='subitem'&&b.depth>note.depth));assert.equal(new Set(bands.map(b=>b.depth)).size,1);assert.equal(rows.find(b=>b.marker==='3)').depth,parent.depth);assert.equal(rows.find(b=>b.marker==='3.').depth,0);assert.equal(rows.at(-1).depth,1);assert.equal(b.map(b=>b.text).join(''),text);
});
test('annex annotation lists retain depth over a page boundary while statutory article paragraphs stay at their own root',()=>{
 const state={mode:'annex'};sourceBlocks('1. 기준\n가. 대상\n2) 규모\n※ 적용 수수 ① 5수 이상',false,state);const b=sourceBlocks('② 10수 이상 ③ 20수 이상\n3) 다음 절차',false,state).filter(b=>b.marker);assert.equal(b[0].depth,4);assert.equal(b[1].depth,4);assert.equal(b[2].depth,2);
 const legal=sourceBlocks('제3조(기준) ① 첫 항\n1. 첫 호\n② 다음 항\n1. 다음 호');assert.deepEqual(legal.filter(b=>b.kind==='clause').map(b=>b.depth),[0,0]);assert.deepEqual(legal.filter(b=>b.family==='numberDot').map(b=>b.depth),[1,1]);
});
test('procedure and table circled lists keep sibling alignment without making the next item a new article',()=>{
 for(const [sop,state] of [[true,{}],[false,{mode:'cell'}]]){const b=sourceBlocks('1. 절차\n2) 규모 ① 5수 ② 10수 ③ 20수\n3) 다음 절차',sop,state).filter(b=>b.marker);const circles=b.filter(b=>b.family==='clause');assert.equal(new Set(circles.map(b=>b.depth)).size,1);assert(circles[0].depth>b.find(b=>b.marker==='2)').depth);assert.equal(b.at(-1).depth,b.find(b=>b.marker==='2)').depth);}
});

test('consecutive annotations are siblings instead of growing deeper after each circled list',()=>{const b=sourceBlocks('1. 기준\n가. 대상\n2) 규모\n※ 첫 주석 ① 5수 ② 10수\n※ 다음 주석 ① 20수 ② 30수',false,{mode:'annex'});assert.deepEqual(b.filter(b=>b.kind==='note').map(b=>b.depth),[3,3]);assert.deepEqual(b.filter(b=>b.kind==='subitem').map(b=>b.depth),[4,4,4,4]);});

test('native PDF lines distinguish real headings from inline references to later subitems and preserve formulas',()=>{
 const text='1. 지원 기준\n다. 지원 기준\n1) 출하 지연 농가: 아래 가) 추가 사육비, 나) 폐사율 증가분, 다) 상품가치 하락분의 총합을 지원.\n가) 추가 사육비: 사육 기간 초과\n(1) 산출식: [(수당 일일 사육비용 × 추가 사육 기간) × 사육마릿수(입식마릿수－폐사 마릿수)]\n(2) 수당 일일 사육비용: 공식 통계\n* 단, 적용 조건을 확인\n** 사육기간: 육계 33일, 산란계 365일';
 const b=sourceBlocks(text,false,{mode:'annex',nativeLines:true}),rows=b.filter(b=>b.marker);assert.deepEqual(rows.map(b=>b.marker),['1.','다.','1)','가)','(1)','(2)','*','**']);assert.deepEqual(rows.slice(0,6).map(b=>b.depth),[0,1,2,3,4,4]);assert.equal(b.map(b=>b.text).join(''),text);assert(rows.find(b=>b.marker==='1)').text.includes('아래 가) 추가 사육비, 나) 폐사율 증가분'));assert(rows.find(b=>b.marker==='(1)').text.includes('×'));
});

test('square, circle and dash lists form stable sibling levels around a criteria note',()=>{
 const text='1. 평가 기준\n□ 산지가격 기준\n○ 가격을 준용한다.\n- 제외 조건\n※ 산지가격 적용\n- 지역 평균\n- 전국 평균\n□ 판매대금 기준\n○ 경락가격을 적용한다.\n2. 다음 기준';
 const b=sourceBlocks(text,false,{mode:'annex',nativeLines:true}),rows=b.filter(b=>b.marker);assert.deepEqual(rows.map(b=>b.marker),['1.','□','○','-','※','-','-','□','○','2.']);assert.deepEqual(rows.map(b=>b.depth),[0,1,2,3,2,3,3,1,2,0]);assert.equal(b.map(b=>b.text).join(''),text);
});
test('mixed-table following provisions retain the monthly-policy circle scope without drifting inward',()=>{
 const state={mode:'annex',nativeLines:true};sourceBlocks('2. 지원 기준\n□ 질병별 지원액\n* 표 적용 주의사항',false,state);
 const text='○ 우선 지급 기준\n* 일 단위 계산\n- 미신청 농가 조치\n* 입식 준비기간\n○ 장기 제한 기준\n* 일 단위 계산\n- 미신청 농가 조치\n* 폐업지원금 기준\n○ 수매 조치 기준';
 const b=sourceBlocks(text,false,state),rows=b.filter(b=>b.marker);assert.deepEqual(rows.map(b=>b.depth),[2,3,3,3,2,3,3,3,2]);assert.equal(b.map(b=>b.text).join(''),text);
});
test('unlabelled page continuation stays inside its bullet while legal paragraphs reset list scope',()=>{
 const state={mode:'annex',nativeLines:true};sourceBlocks('1. 기준\n□ 지원 대상\n○ 다음의 조건을 충족한 경우',false,state);const b=sourceBlocks('이하의 기간을 산정한다.\n○ 다음 대상',false,state);assert.equal(b[0].depth,2);assert.equal(b.find(b=>b.marker==='○').depth,2);
 const legal=sourceBlocks('제3조(기준) ① 첫 항\n□ 대상\n○ 하위\n② 다음 항\n□ 대상');assert.deepEqual(legal.filter(b=>b.marker==='□').map(b=>b.depth),[1,1]);
});

test('table formula notes keep category dashes above age bands without splitting compound livestock names',()=>{
 const text='종계의 주령별 가격산정\n- 산란용종계\nㆍ27주령 : 생산비 + 잔존가치\nㆍ초생추～27주령미만 : 기준\nㆍ27주령이상～78주령미만\n: 주령단위 산정\n- 육용종계\nㆍ31주령 : 생산비';
 const b=sourceBlocks(text,false,{mode:'cell'});assert.deepEqual(b.filter(b=>b.marker).map(b=>b.depth),[1,2,2,2,1,2]);assert.equal(b.map(b=>b.text).join(''),text);
 assert(!sourceBlocks('○ 젖소ㆍ육우ㆍ한우\nㆍ소종축의 상한가격 기준',false,{mode:'annex',nativeLines:true}).some(b=>b.marker==='ㆍ'));
});

test('circled entries within footnotes keep note styling and triple-star notes split from their last entry',()=>{const text='□ 시료채취\n○ 채취내역\n- 지점\n* 도축장 실내 :\n① 생계투입구,\n② 현수실\n** 도축장 실외 :\n① 정문출입구,\n② 계류장 *** 도축장 내외부 상태에 따라 가감\n- 검사방법';const blocks=sourceBlocks(text,true,{mode:'annex'});const notes=blocks.filter(b=>b.family==='note');assert.deepEqual(notes.map(b=>b.marker),['*','**','***']);assert.equal(blocks.filter(b=>b.family==='clause'&&b.noteChild).length,4);assert(blocks.find(b=>b.marker==='***').text.includes('가감'));assert(!blocks.findLast(b=>b.family==='clause').text.includes('***'));});

test('wrapped numeric values closing a parenthesis do not become SOP list items',()=>{const text='혈청형(A, O, C, Asia 1, SAT 1, SAT 2 및 SAT\n3) 이다.\n1) 실제 항목';const blocks=sourceBlocks(text,true,{});assert(!blocks.some(b=>b.marker==='3)'));assert(blocks.some(b=>b.marker==='1)'));assert.equal(blocks.map(b=>b.text).join(''),text);const state={};sourceBlocks('혈청형(A, SAT',true,state);assert(!sourceBlocks('3) 이다.',true,state).some(b=>b.marker==='3)'));});


test('inserted item 2의2 is a sibling of 2 and 3, even when whitespace was flattened',()=>{
 const text='① 다음 각 호의 정보. 1. 질병명 2. 농장 소재지 2의2. 계약한 계열화사업자명 3. 발생 일시',b=sourceBlocks(text),items=b.filter(b=>b.family==='numberDot');assert.deepEqual(items.map(b=>b.marker),['1.','2.','2의2.','3.']);assert.equal(new Set(items.map(b=>b.depth)).size,1);assert.equal(b.map(b=>b.text).join(''),text);
});

test('SOP Korean subitems stay below the preceding decimal heading',()=>{const b=sourceBlocks('3. 지자체\n3.1. 시도\n3.1.1 관내 농장 지도\n가. 준수한다.\n나. 점검한다.\n3.1.2 다음 점검\n가. 확인한다.',true,{});assert.deepEqual(b.filter(x=>x.marker==='가.').map(x=>x.depth),[3,3]);assert.equal(b.find(x=>x.marker==='나.').depth,3);});
