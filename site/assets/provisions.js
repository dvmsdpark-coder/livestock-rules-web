// PDFs can contain both current and future wording of the same article.
export function articleStart(article,doc){
 const text=article.parts.map(p=>p.text).join('\n');
 const dates=[...text.matchAll(/\[시행일\s*:\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*\]/gu)];
 return dates.length?dates.map(m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`).sort().at(-1):doc.from;
}
export function activeArticles(entry,asOf=entry.asOf||entry.doc.from){
 const groups=new Map();
 for(const a of entry.index.articles){const from=articleStart(a,entry.doc);if(from>asOf)continue;
  const prior=groups.get(a.number);if(!prior||prior.from<from)groups.set(a.number,{from,article:a});
 }
 return [...groups.values()].map(x=>x.article);
}
export function searchableChunk(entry,part,asOf){
 const page=entry.index.pages.find(p=>p.page===part.page)?.text;if(!page)return false;
 const start=page.indexOf(part.text);if(start<0)return false;const end=start+part.text.length;
 const active=new Set(activeArticles(entry,asOf));
 for(const a of entry.index.articles){if(active.has(a))continue;
  for(const p of a.parts){if(p.page!==part.page)continue;const at=page.indexOf(p.text);if(at>=0&&start<at+p.text.length&&end>at)return false;}
 }
 return true;
}
