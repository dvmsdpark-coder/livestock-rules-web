// Source-bound reviewed prose annexes. Other annexes default to layout-preserving images.
const reviewed={
 '25ef0494687bf942ebabde909478e218baf7a4d2ec2efe269198d478cd0a6d11':[['1',null],['1','2']],
 '728b40d149eb8ea1402518923138e1a83853598ecf333182c65ba5a1bd7097a5':[['2',null]],
};
export function proseAnnex(doc,annex){return annex.kind==='table'&&(reviewed[doc.sha256]||[]).some(n=>n[0]===annex.number[0]&&(n[1]||null)===(annex.number[1]||null));}
export function previewPage(previews,doc,page){const entry=previews?.documents?.[doc.id];return entry?.source_sha256===doc.sha256?entry.pages[String(page)]||null:null;}

// Generated layouts are usable only for this exact immutable PDF and complete annex range.
export function annexLayouts(layouts,doc,annex){
 if(annex?.kind!=='table')return null;
 const entry=layouts?.documents?.[doc.id];if(entry?.source_sha256!==doc.sha256)return null;
 const pages=[];for(let n=annex.part.page;n<=annex.endPage;n++){const layout=entry.pages[String(n)];if(!layout)return null;pages.push({page:n,...layout});}return pages;
}

// Full prose comes from verified PDF geometry, not the older whitespace-free index.
// A selected excerpt may use it only when the exact non-whitespace sequence is unique.
export function annexProseText(source,layout,fullPage=false){
 if(layout?.mode!=='text'||typeof layout.text!=='string')return {text:source,nativeLines:false,nativePage:false};
 const native=layout.text;if(fullPage)return {text:native,nativeLines:true,nativePage:true};
 const positions=[];let compact='';for(let i=0;i<native.length;i++)if(!/\s/u.test(native[i])){compact+=native[i];positions.push(i);}
 const target=source.replace(/\s/gu,''),at=target?compact.indexOf(target):-1;
 if(at<0||compact.indexOf(target,at+1)>=0)return {text:source,nativeLines:false,nativePage:false};
 return {text:native.slice(positions[at],positions[at+target.length-1]+1),nativeLines:true,nativePage:false};
}

// The selected annex title is already displayed once above its body.
export function withoutAnnexHeading(text,label){
 const key=s=>s.replace(/[^\p{L}\p{N}]/gu,''),heading=key(label),lines=text.split('\n');let body=false;
 const matches=line=>{const candidate=line.replace(/\([^()]*관련[^()]*\)\s*$/u,'');const value=key(candidate.replace(/^\s*\d{1,4}\s+(?=[\[［【]?\s*별(?:표|지))/u,''));return (value.length>=6||/^별(?:표|지)\d/u.test(value))&&heading.includes(value);};
 return lines.filter((line,i)=>{
  if(body)return true;if(!line.trim())return true;
  // A bare printed page number is furniture only immediately before this annex heading.
  if(/^\s*\d{1,4}\s*$/u.test(line)&&matches(lines.slice(i+1).find(s=>s.trim())||''))return false;
  if(matches(line))return false;body=true;return true;
 }).join('\n').trim();
}

// Join only source cells explicitly clipped at both physical page boundaries.
// Character counts and the complete merged grid must survive the join exactly.
const tableText=t=>t.rows.flat().map(c=>c.text).join('');
const glyphs=s=>[...s.replace(/\s/gu,'')].sort().join('');
function completeGrid(table){const occupied=new Set();for(let r=0;r<table.rows.length;r++)for(const c of table.rows[r]){for(let y=r;y<r+c.rowspan;y++)for(let x=c.col;x<c.col+c.colspan;x++){const key=y+':'+x;if(y>=table.rows.length||x>=table.columns||occupied.has(key))return false;occupied.add(key);}}return occupied.size===table.rows.length*table.columns;}
function joinPair(left,right){
 if(left.columns!==right.columns||!left.xs||!right.xs||left.xs.some((x,i)=>Math.abs(x-right.xs[i])>3))return null;
 const result=structuredClone(left),next=structuredClone(right),last=result.rows.length-1;
 const bottom=result.rows.flatMap((row,r)=>row.filter(c=>c.openBottom&&r+c.rowspan-1===last).map(cell=>({cell,row:r})));
 const startsItem=/^\s*(?:\d{1,2}|[가-힣])[).](?=\s|[가-힣「『])/u.test(next.rows[0].find(c=>c.col===0)?.text||'');
 const matches=next.rows[0].flatMap(cell=>{const prior=bottom.find(p=>p.cell.col===cell.col&&p.cell.colspan===cell.colspan);const shared=prior&&cell.col>0&&!cell.text.trim()&&(prior.cell.rowspan>1||/법|제\s*\d+\s*조/u.test(prior.cell.text));return cell.openTop&&prior&&(!startsItem||shared)?[{cell,prior}]:[];});if(!matches.length){if(!startsItem)return null;result.rows.push(...next.rows);result.pages.push(...next.pages);return completeGrid(result)&&glyphs(tableText(result))===glyphs(tableText(left)+tableText(right))?result:null;}
 const collapse=matches.length===next.rows[0].length;
 for(const {cell,prior} of matches){prior.cell.text+="\n"+cell.text;prior.cell.fragments.push(...cell.fragments);prior.cell.rowspan=(collapse?last:last+1)+cell.rowspan-prior.row;prior.cell.openBottom=cell.openBottom;next.rows[0]=next.rows[0].filter(c=>c!==cell);}
 result.rows.push(...(collapse?next.rows.slice(1):next.rows));result.pages.push(...next.pages);
 if(!completeGrid(result)||glyphs(tableText(result))!==glyphs(tableText(left)+tableText(right)))return null;
 return result;
}
export function joinedAnnexLayouts(pages){
 const result=structuredClone(pages);let previous=null,previousPage=null;
 for(const page of result){if(page.mode!=='mixed'){previous=null;previousPage=page.page;continue;}const blocks=[];
  for(const b of page.blocks){if(b.furniture){blocks.push(b);continue;}if(b.kind!=='table'){if(b.text?.trim()||b.kind==='image')previous=null;blocks.push(b);continue;}
   b.pages=[page.page];for(const cell of b.rows.flat())cell.fragments=[{page:page.page,text:cell.text,...(cell.crop?{crop:cell.crop}:{})}];
   const joined=previous&&page.page===previousPage+1?joinPair(previous,b):null;
   if(joined){Object.assign(previous,joined);}else{blocks.push(b);previous=b;}
   previousPage=page.page;
  }page.blocks=blocks;previousPage=page.page;
 }
 return result;
}
