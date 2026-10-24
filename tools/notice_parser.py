"""Pure source-boundary parser shared with the reviewed backend export."""
import re
NUMBER = '제[ \\t]*\\d+[ \\t]*조(?:[ \\t]*의[ \\t]*\\d+)?'
HEADING = re.compile('(?m)^[ \\t]*(?P<number>' + NUMBER + ')[ \\t]*\\((?P<title>[^()\\n]{1,160})\\)(?=[ \\t\\r\\n①-⑳]|$)')
BOUNDARY = re.compile('(?m)^[ \\t]*(?:' + NUMBER + '(?=[ \\t(]|$)|부칙(?=[ \\t<〈]|$)|제[ \\t]*\\d+[ \\t]*(?:장|절)(?=[ \\t(]|$)|[■□][^\\n]*\\[별(?:표|지)|\\[별(?:표|지))')

def canonical_title(value: str) -> str:
    return re.sub('[\\s“”"「」『』·ㆍ]', '', value).strip(' ?？.')

def page_body(text: str, title: str) -> str:
    """Skip only a recognized repeating page header, keeping a source substring."""
    header = re.match('^[ \\t]*법제처[^\\n]*국가법령정보센터[^\\n]*\\n', text)
    if not header:
        return text
    start = header.end()
    lines = text[start:].splitlines(keepends=True)
    if lines and canonical_title(lines[0]) == canonical_title(title):
        start += len(lines[0])
    return text[start:]

def parse_articles(pages: list[dict], title: str) -> list[dict]:
    """Keep page-local original substrings and never cross into another article."""
    articles, current, body_started = ([], None, False)
    for page in sorted(pages, key=lambda p: p['page']):
        text = page_body(page['text_content'], title)
        headings = {m.start(): m for m in HEADING.finditer(text)}
        boundaries = [m for m in BOUNDARY.finditer(text) if not re.match('[ \\t]*' + NUMBER + '[ \\t]*\\([^()\\n]*\\)[에의을를과와은는]', text[m.start():])]
        offsets = sorted(set(headings) | {m.start() for m in boundaries})

        def append_part(start, end):
            if current is not None and text[start:end].strip():
                current['parts'].append({'page': page['page'], 'text_content': text[start:end].strip(), 'text_origin': page.get('text_origin', 'pdf')})
        if not offsets:
            append_part(0, len(text))
            continue
        append_part(0, offsets[0])
        for i, start in enumerate(offsets):
            end = offsets[i + 1] if i + 1 < len(offsets) else len(text)
            heading = headings.get(start)
            if heading:
                current = {'number': re.sub('\\s+', '', heading['number']), 'title': heading['title'].strip(), 'heading': heading.group().strip(), 'parts': [], 'has_body': False}
                articles.append(current)
                if text[heading.end():end].strip():
                    current['has_body'] = True
                    body_started = True
                append_part(start, end)
            else:
                if body_started and re.match('^[ \\t]*(?:부칙|[■□][^\\n]*\\[별(?:표|지)|\\[별(?:표|지))', text[start:]):
                    return [a for a in articles if a['has_body'] or len(a['parts']) > 1]
                current = None
        if current and len(current['parts']) > 1:
            current['has_body'] = True
        if not body_started:
            current = None
    return [a for a in articles if a['has_body'] or len(a['parts']) > 1]
