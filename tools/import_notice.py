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
        'compensation': ('살처분 가축 등에 대한 보상금 등 지급요령', 'compensation-notice', '농림축산식품부고시 제2026-62호', '2026-06-02', 41),
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
    # Reviewed source boundaries are specific to the supplied PDF revisions.
    if scheme == 'income':
        for a in namespace['parse_annexes'](pages[4:], title):
            headings = {('table', '1'): '[별표 1] 소득안정비용의 지원 범위와 기준', ('form', '1'): '[별지 제1호서식] 소득안정비용 지원 신청서', ('form', '2'): '[별지 제2호서식] 소득안정비용 지원 신청표'}
            a['heading'] = headings[(a['section_kind'], a['number'][0])]
            index['annexes'].append({'kind': a['section_kind'], 'number': list(a['number']),
                'heading': a['heading'][:160], 'deleted': a['deleted'], 'endPage': a['parts'][-1]['page'],
                'part': record(a['parts'][0], a['heading'][:160])})
    if scheme == 'compensation':
        assert hashlib.sha256(body).hexdigest() == 'a9c1d886c1dbe0c37fd6133b7552a5778b8b2ebd7bff3822a521e61389f6baf8', 'Review annex boundaries for the new PDF hash'
        reviewed = [
            ('table', ['1', None], 11, 23, '보상금 평가액 상한선'),
            ('table', ['1', '2'], 24, 24, '도태 보상금 지급기준'),
            ('table', ['2', None], 25, 27, '도태 장려금 지급기준'),
            ('table', ['3', None], 28, 31, '생계안정비용 지원기준 등'),
            ('form', ['1', None], 32, 32, '보상금 지급기준 결정서'),
            ('form', ['2', None], 33, 33, '보상금 평가서'),
            ('form', ['3', None], 34, 35, '보상금 지급 신청서'),
            ('form', ['3', '1'], 36, 37, '보상금 지급 신청서(축산계열화사업자)'),
            ('form', ['4', None], 38, 39, '도태 장려금 지급 신청서'),
            ('form', ['5', None], 40, 41, '생계안정비용 지원 신청서'),
        ]
        for kind, number, start, end, label in reviewed:
            prefix = ('별표 ' if kind == 'table' else '별지 제') + number[0] + ('의'+number[1] if number[1] else '') + ('호서식' if kind == 'form' else '')
            heading = '['+prefix+'] '+label
            assert pages[start-1]['text_content'].startswith('[별'), 'Annex start changed'
            index['annexes'].append({'kind':kind, 'number':number, 'heading':heading, 'deleted':False, 'endPage':end, 'part':record(pages[start-1],heading)})
    uid = str(uuid.uuid5(uuid.NAMESPACE_URL, 'livestock-rules-web/'+family+'/'+hashlib.sha256(body).hexdigest()))
    doc = {'id': uid, 'family': family, 'title': title, 'type': '고시', 'disease': '공통', 'version': version,
           'from': date, 'to': None, 'pages': count, 'sha256': hashlib.sha256(body).hexdigest(),
           'pdf': f'pdf/{uid}.pdf', 'data': f'data/{uid}.json', 'article_titles': [a['title'] for a in index['articles']]}
    encoded = json.dumps(index, ensure_ascii=False, separators=(',', ':')).encode()
    doc.update(data_sha256=hashlib.sha256(encoded).hexdigest(), data_bytes=len(encoded))
    (ROOT/'site'/doc['pdf']).write_bytes(body)
    (ROOT/'site'/doc['data']).write_bytes(encoded)
    target = ROOT/'site/data/manifest.json'
    manifest = json.loads(target.read_text(encoding='utf-8'))
    manifest['documents'] = [d for d in manifest['documents'] if d['family'] != family]+[doc]
    manifest['generated_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    target.write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2)+'\n').encode())
    print(json.dumps({'id': uid, 'articles': len(index['articles']), 'annexes': [(a['number'], a['part']['page'], a['endPage']) for a in index['annexes']]}, ensure_ascii=False))

if __name__ == '__main__':
    main()
