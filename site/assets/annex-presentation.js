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

// The selected annex title is already displayed once above its body.
export function withoutAnnexHeading(text,label){
 const key=s=>s.replace(/[^\p{L}\p{N}]/gu,'');const heading=key(label);let body=false;
 return text.split('\n').filter(line=>{if(body)return true;const value=key(line);if(!value)return true;if(value.length>=6&&heading.includes(value))return false;body=true;return true;}).join('\n').trim();
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
 const matches=next.rows[0].flatMap(cell=>{const prior=bottom.find(p=>p.cell.col===cell.col&&p.cell.colspan===cell.colspan);return cell.openTop&&prior?[{cell,prior}]:[];});if(!matches.length)return null;
 const collapse=matches.length===next.rows[0].length;
 for(const {cell,prior} of matches){prior.cell.text+="\n"+cell.text;prior.cell.fragments.push(...cell.fragments);prior.cell.rowspan=(collapse?last:last+1)+cell.rowspan-prior.row;prior.cell.openBottom=cell.openBottom;next.rows[0]=next.rows[0].filter(c=>c!==cell);}
 result.rows.push(...(collapse?next.rows.slice(1):next.rows));result.pages.push(...next.pages);
 if(!completeGrid(result)||glyphs(tableText(result))!==glyphs(tableText(left)+tableText(right)))return null;
 return result;
}
export function joinedAnnexLayouts(pages){
 const result=structuredClone(pages);let previous=null,previousPage=null;
 for(const page of result){if(page.mode!=='mixed'){previous=null;previousPage=page.page;continue;}const blocks=[];
  for(const b of page.blocks){if(b.kind!=='table'){if(b.text?.trim()||b.kind==='image')previous=null;blocks.push(b);continue;}
   b.pages=[page.page];for(const cell of b.rows.flat())cell.fragments=[{page:page.page,text:cell.text}];
   const joined=previous&&page.page===previousPage+1?joinPair(previous,b):null;
   if(joined){Object.assign(previous,joined);}else{blocks.push(b);previous=b;}
   previousPage=page.page;
  }page.blocks=blocks;previousPage=page.page;
 }
 return result;
}
