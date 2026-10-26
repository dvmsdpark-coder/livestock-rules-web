// Mask only source-version-verified margin furniture; keep offsets for legal links.
const compact=s=>s.replace(/\s/gu,'');
export function maskPageFurniture(text,records=[],layoutEdges=null){
 const lines=[...text.matchAll(/[^\n]+/gu)].filter(m=>m[0].trim()),ranges=[];
 for(const item of records){
  const edge=layoutEdges?(layoutEdges[item.edge]?(item.edge==='top'?'start':'end'):null):item.source_edge;
  if(!edge)continue;const line=edge==='start'?lines[0]:lines.at(-1);if(!line||compact(line[0])!==compact(item.text))continue;
  if(!layoutEdges){const rest=compact(edge==='start'?text.slice(line.index+line[0].length):text.slice(0,line.index));
   if(item.context&&(edge==='start'?rest.slice(0,32):rest.slice(-32))!==item.context)continue;
   if(!item.context&&rest)continue;
  }
  ranges.push({start:line.index,end:line.index+line[0].length});
 }
 let result=text;for(const r of ranges)result=result.slice(0,r.start)+result.slice(r.start,r.end).replace(/[^\n]/gu,' ')+result.slice(r.end);return result;
}
