import fs from 'node:fs';import assert from 'node:assert/strict';
import {actualAnnexes} from '../site/assets/annexes.js';
import {annexLayouts,joinedAnnexLayouts} from '../site/assets/annex-presentation.js';
const m=JSON.parse(fs.readFileSync('site/data/manifest.json')),data=JSON.parse(fs.readFileSync('site/data/annex-layouts.json'));
const glyphs=s=>[...s.replace(/\s/gu,'')].sort().join('');
const text=pages=>pages.flatMap(p=>p.mode==='text'?[p.text||'']:(p.blocks||[]).map(b=>b.kind==='text'?b.text:b.kind==='table'?b.rows.flat().map(c=>c.text).join(''):'' )).join('');
let annexes=0,tables=0,joinedTables=0;
for(const doc of m.documents){const index=JSON.parse(fs.readFileSync('site/'+doc.data));for(const annex of actualAnnexes(index).filter(a=>a.kind==='table')){const source=annexLayouts(data,doc,annex);assert(source,'Missing source-bound annex');for(const p of source)if(p.mode==='text')assert.equal(typeof p.text,'string','Missing native PDF prose: '+annex.heading);const joined=joinedAnnexLayouts(source);assert.equal(glyphs(text(source)),glyphs(text(joined)),'Changed characters: '+annex.heading);const original=source.flatMap(p=>(p.blocks||[]).filter(b=>b.kind==='table'));tables+=original.length;const rendered=joined.flatMap(p=>(p.blocks||[]).filter(b=>b.kind==='table'));joinedTables+=rendered.length;
for(const t of rendered){const scoreCols=new Set(t.rows.slice(0,3).flat().filter(c=>/배점|점수|평점/u.test(c.text.replace(/\s/gu,''))).flatMap(c=>Array.from({length:c.colspan},(_,i)=>c.col+i)));for(const row of t.rows)for(const c of row)if(scoreCols.has(c.col)&&/^[\d,.\s]+$/u.test(c.text))assert(c.text.split('\n').filter(s=>s.trim()).length<=1,'Collapsed score levels: '+annex.heading);for(const row of t.rows){const subject=row.find(c=>c.col===0);if(!subject)continue;const markers=[...subject.text.matchAll(/(?:^|\n)(?:\d+|[가-힣])[).](?=\s|[가-힣「『])/gu)];const columns=row.filter(c=>/^[\d, .\n]+$/u.test(c.text)&&c.text.split('\n').filter(Boolean).length>1||/^(?:(?:경고|시정명령|업무정지|영업정지|지정취소|영업소폐쇄|개월|일|년|월|[0-9,./]))+$/u.test(c.text.replace(/\s/gu,''))&&[...c.text.replace(/\s/gu,'').matchAll(/경고|시정명령|업무정지|영업정지|지정취소|영업소폐쇄/gu)].length>1);assert(!(markers.length>=2&&columns.length>=2),'Unresolved detailed decision rows: '+annex.heading);}const slots=new Set();for(let row=0;row<t.rows.length;row++)for(const cell of t.rows[row])for(let y=row;y<row+cell.rowspan;y++)for(let x=cell.col;x<cell.col+cell.colspan;x++){const key=y+':'+x;assert(y<t.rows.length&&x<t.columns&&!slots.has(key),'Broken merged grid');slots.add(key);}assert.equal(slots.size,t.rows.length*t.columns);}
if(doc.id==='73aa19cc-15fb-5758-8a8c-10cc64ab8085'&&annex.number[0]==='2'){
 const payment=rendered.find(t=>t.pages.includes(26)),pairs=payment.rows.slice(1,11).map(row=>[1,2].map(col=>row.find(c=>c.col===col).text));
 assert.deepEqual(pairs,[['송아지','200,000'],['초임만삭','500,000'],['초산우','400,000'],['다산우(2-5산)','300,000'],['노산우ㆍ기타','200,000'],['임신우(초임단계이후)','400,000'],['300～499kg 이하(암ㆍ수)','200,000'],['299kg 이하(암ㆍ수)','300,000'],['모돈','150,000'],['웅돈','150,000']]);
 assert.equal(payment.rows[1].find(c=>c.col===0).rowspan,5);assert.equal(payment.rows[1].find(c=>c.col===3).rowspan,5);
}
if(doc.sha256==='25ef0494687bf942ebabde909478e218baf7a4d2ec2efe269198d478cd0a6d11'&&annex.number[0]==='18'){
 const rows=rendered.flatMap(t=>t.rows),clean=s=>s.replace(/\s/gu,'');
 for(const [disease,expected] of [['돼지오제스키병',[['혈청중화시험','1두','4,800원'],['간이진단킷트검사','1두','2,600원'],['감별진단킷트검사(항체효소면역법)','1두','4,700원']]],['돼지생식기호흡기증후군',[['간접형광항체법','1두','4,000원'],['효소면역법','1두','8,700원']]],['뉴캣슬병',[['혈구응집억제반응법','5수','16,300원'],['효소면역법','5수','18,300원']]],['조류인플루엔자',[['효소면역법','5수','18,800원'],['혈구응집억제반응법','5수','17,300원'],['한천겔침강반응법','5수','9,900원']]]]){
  const start=rows.findIndex(row=>row.some(c=>c.col===1&&clean(c.text)===disease));assert(start>=0,disease);assert.equal(rows[start].find(c=>c.col===1).rowspan,expected.length);assert.deepEqual(rows.slice(start,start+expected.length).map(row=>[2,3,4].map(col=>clean(row.find(c=>c.col===col).text))),expected);
 }
}
if(doc.type==='시행령'&&annex.number[0]==='1'&&annex.number[1]==='2'){assert.equal(rendered.length,1);assert.deepEqual(rendered[0].pages,[26,27,28]);assert.equal(rendered[0].rows.length,9);}
if(doc.type==='시행령'&&annex.number[0]==='3'){
 const rows=rendered.flatMap(t=>t.rows),amounts=row=>[2,3,4].map(col=>row.find(c=>c.col===col)?.text.replace(/\s/gu,'')||'');
 for(const [prefix,expected] of [['터.',[['100','400','1,000'],['100','400','800'],...Array.from({length:5},()=>['500','750','1,000'])]],['퍼.',[['50','200','300'],['50','100','200'],['100','150','200'],['100','150','200'],['50','100','200'],['50','100','200'],['50','150','300'],['50','100','200']]]]){
  const start=rows.findIndex(row=>row.some(c=>c.col===0&&c.text.startsWith(prefix)));assert(start>=0);assert.deepEqual(amounts(rows[start]),['','','']);assert.equal(rows[start].find(c=>c.col===1).rowspan,expected.length+1);
  for(let i=0;i<expected.length;i++){assert(rows[start+i+1].some(c=>c.col===0&&c.text.startsWith((i+1)+')')),prefix+' child '+(i+1));assert.deepEqual(amounts(rows[start+i+1]),expected[i],prefix+' amount '+(i+1));}
 }
 const clipped=rows.findIndex(row=>row.some(c=>c.col===0&&c.text.startsWith('처.')));assert(clipped>=0);assert.deepEqual(amounts(rows[clipped+1]),['50','200','1,000']);assert.deepEqual(amounts(rows[clipped+2]),['300','600','1,000']);
 const parent=rows.findIndex(row=>row.some(c=>c.col===0&&c.text.startsWith('고.')));assert(parent>=0);const children=rows.slice(parent+1,parent+5);const ga=children.find(row=>row.some(c=>c.col===0&&c.text.startsWith('가)'))),na=children.find(row=>row.some(c=>c.col===0&&c.text.startsWith('나)')));assert(ga&&na);assert.deepEqual(amounts(ga),['50','150','300']);assert.deepEqual(amounts(na),['100','200','300']);
}
if(doc.type==='시행규칙'&&annex.number[0]==='1'&&annex.number[1]==='5'){
 const rows=rendered.flatMap(t=>t.rows),flat=s=>s.replace(/\s/gu,''),find=prefix=>rows.find(row=>row.some(c=>c.col===0&&flat(c.text).startsWith(prefix))),v=row=>[2,3,4].map(col=>flat(row.find(c=>c.col===col)?.text||''));
 assert.deepEqual(v(find('가.영업신고')),['영업소폐쇄','영업정지1개월','영업정지3개월']);assert.deepEqual(v(find('나.변경신고')),['시정명령','','']);
}
if(doc.type==='시행규칙'&&annex.number[0]==='1'&&annex.number[1]==='8'){
 const rows=rendered.flatMap(t=>t.rows),start=rows.findIndex(row=>row.some(c=>c.col===0&&c.text.startsWith('나.'))),expected=[['업무정지1개월','업무정지3개월','업무정지6개월'],['업무정지15일','업무정지1개월','업무정지2개월'],['업무정지15일','업무정지1개월','업무정지2개월'],['업무정지7일','업무정지15일','업무정지1개월'],['경고','업무정지7일','업무정지15일']];assert(start>=0);for(let i=0;i<5;i++){const row=rows[start+1+i];assert(row.some(c=>c.col===0&&c.text.startsWith((i+1)+')')));assert.deepEqual([2,3,4].map(col=>row.find(c=>c.col===col)?.text.replace(/\s/gu,'')||''),expected[i]);}
}
if(doc.type==='시행규칙'&&annex.number[0]==='14'&&annex.number[1]==='6'){
 const rows=rendered.flatMap(t=>t.rows),start=rows.findIndex(row=>row.some(c=>c.col===0&&c.text.startsWith('나.')));assert(start>=0);for(let i=0;i<6;i++){const row=rows[start+1+i];assert(row.some(c=>c.col===0&&c.text.startsWith((i+1)+')')));assert.deepEqual([2,3,4,5].map(col=>row.find(c=>c.col===col)?.text.replace(/\s/gu,'')||''),['경고','업무정지1개월','업무정지3개월','지정취소']);}
}
if(doc.type==='시행규칙'&&annex.number[0]==='3'&&!annex.number[1]){
 const t=rendered.find(t=>t.columns===4&&t.rows.some(row=>row.some(c=>c.col===3&&c.text.replace(/\s/gu,'')==='배점')));assert(t,'Missing scoring matrix');
 const levels4=['4개모두적합','3개적합','2개적합','1개적합','모두부적합'],levels2=['2개모두적합','1개적합','모두부적합'];
 for(let group=1;group<=5;group++){const expected=group<=3?['10','8','6','4','0']:group===4?['10','5','0']:['5','3','0'],levels=group<=3?levels4:levels2;const start=t.rows.findIndex(row=>row.some(c=>c.col===0&&c.text.startsWith(group+'.')));assert(start>=0);const common=t.rows[start].find(c=>c.col===1);assert.equal(common.rowspan,expected.length,'Evaluation checklist must stay merged');assert.equal(t.rows[start].find(c=>c.col===0).rowspan,expected.length);assert.equal([...common.text.matchAll(/[가-라]\./gu)].length,group<=3?4:2,'Checklist count must not be equated to score-level count');
  for(let i=0;i<expected.length;i++){const row=t.rows[start+i];assert.equal(row.find(c=>c.col===2).text.replace(/\s/gu,''),levels[i]);assert.equal(row.find(c=>c.col===3).text.replace(/\s/gu,''),expected[i]);}
 }
}
annexes++;}}
console.log(`PASS ${annexes} annexes: ${tables} source tables → ${joinedTables} screen tables; all characters and merged cells preserved`);
