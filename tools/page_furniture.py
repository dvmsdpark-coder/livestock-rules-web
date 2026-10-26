"""Identify printed page numbers from PDF margins and a repeated page sequence."""
import re
from collections import defaultdict
from statistics import median

NUMBER=re.compile(r'^(?:[-–—]\s*)?(\d{1,4})(?:\s*[-–—])?$')
def compact(text):return re.sub(r'\s+','',text)

def page_candidates(page,rows,source,number):
    result=[];source_lines=[line for line in source.splitlines() if line.strip()]
    words=page.extract_words() if hasattr(page,'extract_words') else []
    positions=[*((bounds,label,False) for bounds,label in rows),*(( (word['x0'],word['top'],word['x1'],word['bottom']),word['text'],not word.get('upright',True)) for word in words)]
    for bounds,label,rotated in positions:
        match=NUMBER.fullmatch(label.strip())
        if not match:continue
        edge='top' if bounds[3]<=page.height*.12 else 'bottom' if bounds[1]>=page.height*.86 else None
        if not edge and rotated:
            edge='left' if bounds[2]<=page.width*.1 else 'right' if bounds[0]>=page.width*.9 else None
        if not edge:continue
        source_edge='start' if source_lines and compact(source_lines[0])==compact(label) else 'end' if source_lines and compact(source_lines[-1])==compact(label) else None
        if not source_edge:continue
        context=compact(''.join(source_lines[1:] if source_edge=='start' else source_lines[:-1]))
        context=context[:32] if source_edge=='start' else context[-32:]
        if any(item['edge']==edge and compact(item['text'])==compact(label) for item in result):continue
        result.append({'text':label,'number':int(match[1]),'page':number,'edge':edge,'source_edge':source_edge,'context':context,'box':list(bounds),'band':round(bounds[0]/page.width if edge in ('left','right') else bounds[1]/page.height,2)})
    return result

def confirmed_furniture(candidates):
    groups=defaultdict(list)
    for item in candidates:
        groups[(item['edge'],item['page']-item['number'])].append(item)
    result=defaultdict(list)
    for group in groups.values():
        # Position alone cannot distinguish a table value from a printed page number.
        if len({item['page'] for item in group})<3:continue
        band=median(item['band'] for item in group)
        for item in group:
            if abs(item['band']-band)>.03:continue
            result[str(item['page'])].append({k:v for k,v in item.items() if k not in ('page','band')})
    return dict(result)
