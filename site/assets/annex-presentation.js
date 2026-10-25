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
