"""Import a supplied, reviewed digital notice without altering the original PDF.

Run from repository root: python tools/import_notice.py PDF income|compensation.
Keep these static supplements when refreshing the separate Docker DB export.
"""
import ast
import datetime
import hashlib
import json
from pathlib import Path
import re
import sys
import uuid
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]

def pure_parser(path, names, namespace):
    tree = ast.parse(path.read_text(encoding='utf-8'))
    nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names
             or isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in n.targets)]
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), 'exec'), namespace)

def main():
    source, scheme = Path(sys.argv[1]), sys.argv[2]
    profiles = {
        'income': ('소득안정비용 지원 요령', 'income-support-notice', '농림축산식품부고시 제2026-97호', '2026-10-01', 11),
        'compensation': ('살처분 가축 등에 대한 보상금 등 지급요령', 'compensation-notice', '농림축산식품부고시 제2026-62호', '2026-06-02', 7),
    }
    title, family, version, date, count = profiles[scheme]
    body = source.read_bytes()
    reader = PdfReader(source)
    assert len(reader.pages) == count
    pages = [{'page': i+1, 'text_content': p.extract_text(), 'text_origin': 'pdf'} for i, p in enumerate(reader.pages)]
    assert title.replace(' ', '') in re.sub(r'\s+', '', pages[0]['text_content'])
    namespace = {'re': re}
    pure_parser(ROOT/'tools/notice_parser.py',
                {'NUMBER', 'HEADING', 'BOUNDARY', 'canonical_title', 'page_body', 'parse_articles'}, namespace)
    pure_parser(ROOT/'tools/supplemental.py', {'ANNEX', 'parse_annexes'}, namespace)
    def record(p, heading):
        text = p['text_content'].strip()
        assert text in pages[p['page']-1]['text_content']
        return {'page': p['page'], 'text': text, 'display': re.sub(r'\s+', ' ', text), 'origin': 'pdf', 'heading': heading}
    index = {'pages': [{'page': p['page'], 'text': p['text_content']} for p in pages],
             'articles': [], 'definitions': [], 'annexes': [], 'procedures': [], 'chunks': []}
    for a in namespace['parse_articles'](pages, title):
        index['articles'].append({'number': a['number'], 'title': a['title'],
                                  'parts': [record(p, a['heading']) for p in a['parts']]})
    # Source review: income table pp5-9, forms pp10 and11. Compensation supplied
    # PDF contains only an appendix list, not the actual tables/forms.
    if scheme == 'income':
        for a in namespace['parse_annexes'](pages[4:], title):
            headings = {('table', '1'): '[별표 1] 소득안정비용의 지원 범위와 기준', ('form', '1'): '[별지 제1호서식] 소득안정비용 지원 신청서', ('form', '2'): '[별지 제2호서식] 소득안정비용 지원 신청표'}
            a['heading'] = headings[(a['section_kind'], a['number'][0])]
            index['annexes'].append({'kind': a['section_kind'], 'number': list(a['number']),
                'heading': a['heading'][:160], 'deleted': a['deleted'], 'endPage': a['parts'][-1]['page'],
                'part': record(a['parts'][0], a['heading'][:160])})
    uid = str(uuid.uuid5(uuid.NAMESPACE_URL, 'livestock-rules-web/'+family+'/'+hashlib.sha256(body).hexdigest()))
    doc = {'id': uid, 'family': family, 'title': title, 'type': '고시', 'disease': '공통', 'version': version,
           'from': date, 'to': None, 'pages': count, 'sha256': hashlib.sha256(body).hexdigest(),
           'pdf': f'pdf/{uid}.pdf', 'data': f'data/{uid}.json', 'article_titles': [a['title'] for a in index['articles']]}
    if scheme == 'compensation':
        doc['search_note'] = '제공 PDF에는 별표·별지 목록만 있고 실제 첨부 표·서식은 포함되어 있지 않습니다. 해당 고시의 첨부자료는 별도로 확인해야 합니다.'
    encoded = json.dumps(index, ensure_ascii=False, separators=(',', ':')).encode()
    doc.update(data_sha256=hashlib.sha256(encoded).hexdigest(), data_bytes=len(encoded))
    (ROOT/'site'/doc['pdf']).write_bytes(body)
    (ROOT/'site'/doc['data']).write_bytes(encoded)
    target = ROOT/'site/data/manifest.json'
    manifest = json.loads(target.read_text(encoding='utf-8'))
    manifest['documents'] = [d for d in manifest['documents'] if d['family'] != family]+[doc]
    manifest['generated_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'id': uid, 'articles': len(index['articles']), 'annexes': [(a['number'], a['part']['page'], a['endPage']) for a in index['annexes']]}, ensure_ascii=False))

if __name__ == '__main__':
    main()
