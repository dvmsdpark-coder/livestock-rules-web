// Presentation boundaries only: source offsets and characters remain unchanged.
export const documentGroup=doc=>doc.type==='SOP'?'SOP':doc.type==='고시'?'고시':'법령';
const letters='가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토포호';
const order=['numberDot','koreanDot','numberClose','koreanClose','numberParen','koreanParen'];
const token=new RegExp('(?:^|(?<=\\s))(?:(?<chapter>[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+[.． ]+|제\\s*\\d+\\s*[장절]\\s*)|(?<decimal>\\d{1,2}(?:[.,]\\d{1,2})+\\.?)(?!\\d)|(?<numberParen>\\(\\d{1,2}\\))|(?<koreanParen>\\(['+letters+']\\))|(?<numberClose>\\d{1,2}\\))|(?<koreanClose>['+letters+']\\))|(?<numberDot>\\d{1,2}\\.)(?!\\d)|(?<koreanDot>['+letters+']\\.)|(?<clause>[①-⑳])|(?<bullet>[-○◦▷▶])(?=[ \\t])|(?<note>※|\\*{1,2}(?=[ \\t])))','gu');
export function sourceBlocks(text,sop=false,state={},protectedRanges=[]){
 const dates=[...text.matchAll(/\d{4}\s*\.\s*\d{1,2}\s*\.\s*\d{1,2}\s*\.?/gu)].map(m=>({start:m.index,end:m.index+m[0].length}));
 const cuts=new Map([[0,{kind:sop?'prose':'paragraph',depth:state.depth??0}]]);
 for(const m of text.matchAll(token)){
  const start=m.index,family=Object.keys(m.groups).find(k=>m.groups[k]!==undefined),marker=m[0],after=text.slice(start+marker.length),lineStart=!text.slice(text.lastIndexOf('\n',start-1)+1,start).trim();
  if(protectedRanges.some(r=>start>r.start&&start<r.end)||dates.some(r=>start>=r.start&&start<r.end))continue;
  if(['chapter','bullet','note'].includes(family)&&!lineStart)continue;
  if(state.nativeLines&&!lineStart&&family!=='clause')continue;
  if(family==='decimal'){
   if(!lineStart&&!sop)continue;
   if(!lineStart&&marker.split(/[.,]/u)[0]!==state.root)continue;
   if(!sop&&!/^[ \t]/u.test(after))continue;
   if(/^[ \t]*(?:%|㎜|㎝|미터|센티미터|킬로|개월|시간|분간|초간|m(?:m|²|³)?\b|km\b)/iu.test(after))continue;
  }else if(['numberParen','koreanParen'].includes(family)){
   // Parenthesized cross-references such as “(1)부터 (4)까지” are not list labels.
   if(!/^[ \t\n]+[^\s]/u.test(after))continue;
  }else if(['numberDot','koreanDot'].includes(family)&&!/^[ \t]+\S/u.test(after))continue;
  let depth=state.depth??0,kind='item';
  if(!['clause','note','bullet'].includes(family)){state.circleDepth=null;state.noteDepth=null;}
  if(family==='chapter'){kind='heading';depth=0;state.clause=false;state.order=null;state.stack=[];state.decimal=false;}
  else if(family==='clause'){
   if(state.mode==='annex'||state.mode==='cell'||sop){
    // Circled labels in appendices/procedures are local lists, not article paragraphs.
    const hasParent=Boolean(state.stack?.length||state.decimal);
    const childDepth=state.noteDepth!=null?state.noteDepth+1:hasParent?(state.depth??0)+1:0;
    depth=state.circleDepth??childDepth;
    kind=depth?'subitem':'item';state.circleDepth=depth;
   }else{kind='clause';depth=0;state.clause=true;state.stack=[];state.noteDepth=null;}
  }
  else if(family==='decimal'){kind='step';depth=marker.replace(/[.,]$/u,'').split(/[.,]/u).length-1;state.decimal=true;}
  else if(family==='bullet'||family==='note'){
   kind=family;depth=(state.depth??0)+1;
   if(family==='note'){depth=state.noteDepth??depth;state.noteDepth=depth;state.circleDepth=null;}
  }
  else {
   if(state.mode==='cell'&&!state.order){
    // Tables restart their own outline: (가), (나), … can contain 1), 2), … .
    state.order=family==='koreanParen'?['koreanParen','numberClose','koreanClose','numberParen','numberDot','koreanDot']:order.slice(order.indexOf(family));
   }
   const grammar=state.order||order,rank=grammar.indexOf(family);
   const stack=state.stack??=[];while(stack.length&&stack.at(-1).rank>=rank)stack.pop();
   depth=(stack.length?stack.at(-1).depth+1:Math.max(0,rank)+(state.clause?1:0));stack.push({rank,depth});
  }
  cuts.set(start,{kind,depth,marker,markerStart:start,markerEnd:start+marker.length,family});
  if(family==='numberDot'||family==='decimal')state.root=marker.split(/[.,]/u)[0];
  if(!['bullet','note'].includes(family))state.depth=depth;
 }
 const entries=[...cuts].sort((a,b)=>a[0]-b[0]);
 return entries.map(([start,format],i)=>{const end=entries[i+1]?.[0]??text.length;return {start,end,...format,text:text.slice(start,end)};});
}
