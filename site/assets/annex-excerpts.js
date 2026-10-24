import {compensationFloorRequest} from './question.js?v=20261024-22';
// Exact native-text boundaries only. Dense grids/forms remain PDF layouts.
const flat=s=>s.replace(/\s/gu,'');
function cut(source,start,end){return source.spans.flatMap(p=>{
 const a=Math.max(start,p.start),b=Math.min(end,p.end);if(a>=b)return [];
 const text=p.text.slice(a-p.start,b-p.start);return text.trim()?[{page:p.page,text,display:text.replace(/\n(?![ \t]*(?:\d+\)|[가-힣]{1,2}[.)]|[①-⑳]))/gu,' ').replace(/[ \t]+/gu,' ').trim()}]:[];
});}
export function annexUnits(entry,annex){
 let offset=0;const spans=entry.index.pages.filter(p=>p.page>=annex.part.page&&p.page<=annex.endPage).map(p=>{const s={...p,start:offset,end:offset+p.text.length};offset=s.end+1;return s;});
 const source={spans,text:spans.map(p=>p.text).join('\n')};
 const roots=[...source.text.matchAll(/^[ \t]{0,1}(\d{1,2})\.[ \t]+/gmu)];
 const units=[];
 for(let i=0;i<roots.length;i++){
  const root=roots[i],end=roots[i+1]?.index??source.text.length,body=source.text.slice(root.index,end);
  const letters=[...body.matchAll(/^[ \t]{0,3}([가-힣]{1,2})\.[ \t]+/gmu)];
  const intro=cut(source,root.index,letters.length?root.index+letters[0].index:end);
  const parent={key:root[1],label:'제'+root[1]+'호',root:Number(root[1]),intro,parts:cut(source,root.index,end),children:letters.length>0};units.push(parent);
  for(let j=0;j<letters.length;j++){
   const m=letters[j],start=root.index+m.index,stop=root.index+(letters[j+1]?.index??body.length);
   units.push({key:root[1]+':'+m[1],label:parent.label+' '+m[1]+'목',root:parent.root,intro,parts:cut(source,start,stop),children:false});
  }
 }
 return units;
}
export function annexExcerpt(entry,annex,question){
 if(annex.kind!=='table'||annex.deleted)return null;
 const units=annexUnits(entry,annex);if(!units.length)return null;
 const q=flat(question),negative=/미접종|접종하지|접종안|안맞|위반|불이행/u.test(q);
 const concepts=[['예방접종',/백신|예방접종|미접종|접종하지|접종안|안맞/u],['신고',/신고/u],['소독',/소독/u],['살처분',/살처분/u],['역학조사',/역학조사/u],['차량',/차량/u],['사료',/사료/u]];
 let terms=concepts.filter(([,pattern])=>pattern.test(q)).map(([t])=>t);
 if(terms.includes('예방접종'))terms=terms.filter(t=>t!=='살처분');

 const relief=/경감|완화|최초(?:로)?신고|처음(?:으로)?신고/u.test(q);
 const reliefTopics=[[/최초(?:로)?신고|처음(?:으로)?신고/u,/최초로신고/u],[/증상.*(?:최초|나타)|(?:최초|나타).*증상/u,/발병증상이외관상최초/u],[/질병관리등급|[12]등급/u,/질병관리등급/u],[/항체|양성률/u,/항체양성률/u],[/교육|전화예찰|우수방역/u,/우수방역농가/u],[/HACCP|인증|무항생제|유기축산/iu,/인증/u]];
 const requested=reliefTopics.filter(([pattern])=>pattern.test(q));
 const ranked=units.filter(u=>!u.children).map(u=>{
  const text=flat(u.parts.map(p=>p.text).join(''));
  const hits=terms.filter(t=>text.includes(t));
  const score=(relief?(u.root===3?30:-100):0)+requested.filter(([,pattern])=>pattern.test(text)).length*40+hits.length*3+(negative&&terms.includes('예방접종')&&/예방접종명령을위반/u.test(text)?20:0);
  return {...u,score};
 }).filter(u=>u.score>0).sort((a,b)=>b.score-a.score);

 let selected=ranked.filter(u=>u.score===ranked[0]?.score).slice(0,2);
 if(relief&&!terms.length&&!requested.length){const parent=units.find(u=>u.root===3&&u.children);if(parent)selected=[parent];}
 const floorUnits=units.filter(u=>!u.children&&/제1호부터제3호까지에도불구/u.test(flat(u.parts.map(p=>p.text).join('')))&&/100분의20/u.test(flat(u.parts.map(p=>p.text).join(''))));
 const floor=compensationFloorRequest(question)&&floorUnits.length>0;
 if(floor){const objects=/물건|물품|오염물/u.test(q),animals=/가축|살처분/u.test(q);selected=floorUnits.filter(u=>objects&&!animals?flat(u.parts.map(p=>p.text).join('')).includes('물건평가액'):animals&&!objects?flat(u.parts.map(p=>p.text).join('')).includes('가축평가액'):true).map(u=>({...u,intro:[]}));}
 const common=floor?[]:units.filter(u=>!u.children&&/제1호부터제3호까지에도불구/u.test(flat(u.parts.map(p=>p.text).join(''))));
 const adjustment=floor||selected.some(u=>u.root===3)?[]:units.filter(u=>u.root===3&&u.children);
 // Crops were visually reviewed against this immutable source PDF. Never reuse
 // them with a different revision or reinterpret the rate as an actual award.
 const reviewed=entry.doc.sha256==='728b40d149eb8ea1402518923138e1a83853598ecf333182c65ba5a1bd7097a5';
 for(const u of [...common,...selected].filter(u=>[4,5].includes(u.root)))if(reviewed)u.images=u.key==='4'?[{page:35,path:'assets/annex/decree2-4-35.png'}]:u.key==='5'?[{page:35,path:'assets/annex/decree2-5-35.png'},{page:36,path:'assets/annex/decree2-5-36.png'}]:[];
 for(const u of [...selected,...units])if(reviewed&&u.key==='2:카')u.images=[{page:32,path:'assets/annex/decree2-2-ka-32.png'},{page:33,path:'assets/annex/decree2-2-ka-33.png'}];
 return {label:'별표 '+annex.number.filter(Boolean).join('의'),selected,common,adjustment,choices:units.filter(u=>!u.children)};
}
