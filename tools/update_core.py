"""Local-only, staged PDF revision workflow. No Docker, database or paid service."""
import datetime as dt
import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import uuid

from pypdf import PdfReader
from notice_parser import parse_articles
from supplemental import parse_annexes, ANNEX

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / 'private' / 'updates'

def digest(value):
    return hashlib.sha256(value).hexdigest()

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()

def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))

def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encoded(value))

def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def safe_path(root, name):
    root = Path(root).resolve()
    path = (root / name).resolve()
    if not path.is_relative_to(root) or path == root:
        raise ValueError('허용되지 않은 파일 경로입니다.')
    return path

def stage_path(identifier):
    if not re.fullmatch(r'[a-f0-9]{16}', identifier):
        raise ValueError('잘못된 후보 번호입니다.')
    return safe_path(PRIVATE, identifier)

def engine_hash():
    paths = sorted((ROOT/'site/assets').rglob('*.js')) + sorted((ROOT/'tools').glob('*.mjs')) + sorted((ROOT/'tools').glob('*.py')) + sorted((ROOT/'tests').rglob('*.mjs')) + sorted((ROOT/'tests/fixtures').glob('*.json')) + sorted((ROOT/'tools').glob('*.html')) + [p for p in [ROOT/'maintenance/catalog.json',ROOT/'site/index.html'] if p.exists()]
    return digest(b''.join(str(p.relative_to(ROOT)).encode()+p.read_bytes() for p in paths))

def snapshot_hash(site):
    manifest = read(site/'data/manifest.json')
    chunks = [(site/'data/manifest.json').read_bytes()]
    for doc in manifest['documents']:
        for key in ('pdf', 'data'):
            chunks.append(safe_path(site, doc[key]).read_bytes())
    return digest(b''.join(chunks))

def record(page, text, heading='', kind='body'):
    text = text.strip()
    if text not in page['text']:
        raise ValueError('발췌가 PDF 추출 원문과 일치하지 않습니다.')
    return {'page':page['page'], 'text':text, 'display':re.sub(r'\s+', ' ', text),
            'origin':'pdf', 'heading':heading, 'kind':kind}

def extract(source):
    reader = PdfReader(source)
    if reader.is_encrypted:
        raise ValueError('암호화된 PDF는 먼저 암호를 해제해주세요.')
    return [{'page':i+1, 'text':page.extract_text() or ''} for i,page in enumerate(reader.pages)]

def suggested_profile(pages, title, source_hash):
    raw = [{'page':p['page'], 'text_content':p['text'], 'text_origin':'pdf'} for p in pages]
    # Skip only pages that consist entirely of an attachment list. Short blank
    # forms are still real attachments and must remain review candidates.
    def attachment_list(page):
        text=page['text_content'];matches=list(ANNEX.finditer(text))
        return len(matches)>=2 and all(len(m.group())<180 and not text[m.end():(matches[i+1].start() if i+1<len(matches) else len(text))].strip() for i,m in enumerate(matches))
    annex_pages=[p for p in raw if not attachment_list(p)]
    candidates = parse_annexes(annex_pages, title)
    return {'schema':1, 'source_sha256':source_hash,
        'page_kinds':{str(p['page']):('figure' if len(re.sub(r'\s','',p['text']))<30 else 'body') for p in pages},
        'annexes':[{'kind':a['section_kind'], 'number':list(a['number']), 'heading':re.split(r'(?<!\d)\d+\.(?!\d)',a['heading'],maxsplit=1)[0].strip()[:100],
                    'start':a['parts'][0]['page'], 'end':a['parts'][-1]['page'], 'deleted':a['deleted']} for a in candidates],
        'exclude':[], 'procedures':[]}

def build_index(pages, doc, profile):
    if profile.get('source_sha256') != doc['sha256']:
        raise ValueError('이 PDF용 검토 프로필이 아닙니다. 이전 페이지 범위를 재사용할 수 없습니다.')
    by_page = {p['page']:p for p in pages}
    excluded = set()
    for start,end in profile.get('exclude',[]):
        if not 1 <= start <= end <= len(pages):
            raise ValueError('검색 제외 페이지 범위를 확인해주세요.')
        excluded.update(range(start,end+1))
    raw = [{'page':p['page'], 'text_content':p['text'], 'text_origin':'pdf'} for p in pages if p['page'] not in excluded]
    index = {'pages':pages, 'articles':[], 'definitions':[], 'annexes':[], 'procedures':[], 'chunks':[]}
    if doc['type'] != 'SOP':
        for a in parse_articles(raw, doc['title']):
            index['articles'].append({'number':a['number'], 'title':a['title'],
                'parts':[record(by_page[p['page']],p['text_content'],a['heading']) for p in a['parts']]})
        if not index['articles']:
            raise ValueError('조문을 추출하지 못했습니다. OCR 또는 조문 경계 검토가 필요합니다.')
        for article in index['articles']:
            if article['title'] != '정의':continue
            for p in article['parts']:
                for m in re.finditer(r'[“"「『]([^\n“”"「」『』]{1,60})[”"」』]\s*(?:이란|란)',p['text']):
                    start=p['text'].rfind('\n',0,m.start())+1
                    following=re.search(r'(?m)^\s*(?:\d+\.\s|[①-⑳]|제\d+조)',p['text'][m.end():])
                    end=m.end()+following.start() if following else len(p['text'])
                    text=p['text'][start:end].strip()
                    if re.search(r'말한다\.|뜻한다\.',text):
                        index['definitions'].append({'term':m[1], 'part':record(by_page[p['page']],text,'정의 · '+m[1])})
    page_kinds = profile.get('page_kinds',{})
    for p in pages:
        kind=page_kinds.get(str(p['page']))
        if kind not in ('body','table','form','figure','blank','title'):
            raise ValueError('모든 페이지의 본문/표/서식/그림/공백/간지 분류를 지정해주세요.')
    occupied=set()
    for a in profile.get('annexes',[]):
        start,end=int(a['start']),int(a['end'])
        if a['kind'] not in ('table','form') or not 1 <= start <= end <= len(pages):
            raise ValueError('별표·별지의 종류와 시작/끝 페이지를 확인해주세요.')
        if any(n in occupied or n in excluded for n in range(start,end+1)):
            raise ValueError('별표·별지 범위가 중복되거나 검색 제외 범위와 겹칩니다.')
        if len(a['number']) != 2 or not str(a['number'][0]).isdigit():
            raise ValueError('별표 번호는 ["2", null] 또는 ["1", "2"] 형식입니다.')
        occupied.update(range(start,end+1))
        first=record(by_page[start],by_page[start]['text'],a['heading'],a['kind'])
        index['annexes'].append({'kind':a['kind'],'number':a['number'],'heading':a['heading'],
            'deleted':bool(a.get('deleted')), 'endPage':end, 'part':first})
        for n in range(start,end+1):page_kinds[str(n)]=a['kind']
    for p in pages:
        if p['page'] in excluded or not p['text'].strip():continue
        kind=page_kinds[str(p['page'])]
        if kind in ('blank','title'):continue
        index['chunks'].append(record(p,p['text'],kind=kind))
    for procedure in profile.get('procedures',[]):
        start,end=int(procedure['start']),int(procedure['end'])
        if procedure['intent'] not in ('reporting','movement_release','farm_disinfection') or not 1<=start<=end<=len(pages):
            raise ValueError('SOP 절차의 유형과 페이지 범위를 확인해주세요.')
        if any(n in excluded or page_kinds[str(n)]!='body' for n in range(start,end+1)):
            raise ValueError('SOP 절차에 제외·표·그림·서식 페이지가 포함되어 있습니다.')
        anchor=procedure.get('anchor','').strip()
        if not anchor or re.sub(r'\s','',anchor) not in re.sub(r'\s','',by_page[start]['text']):
            raise ValueError('SOP 시작 페이지에서 확인한 제목(anchor)을 입력해주세요.')
        index['procedures'].append({'intent':procedure['intent'], 'scenario':procedure.get('scenario',''),
            'parts':[record(by_page[n],by_page[n]['text'],procedure.get('heading',anchor)) for n in range(start,end+1)]})
    return index

def page_changes(old,new):
    norm=lambda p:re.sub(r'\s+','',p['text'])
    matcher=difflib.SequenceMatcher(a=[norm(p) for p in old], b=[norm(p) for p in new], autojunk=False)
    changes=[]
    for kind,a,b,c,d in matcher.get_opcodes():
        if kind=='equal':continue
        changes.append({'kind':kind,'old_pages':list(range(a+1,b+1)), 'new_pages':list(range(c+1,d+1))})
    return changes

def prepare(source, family, version, effective_from, date_note='', site=None):
    site=Path(site or ROOT/'site').resolve()
    source=Path(source).resolve()
    body=source.read_bytes()
    if not body.startswith(b'%PDF-') or len(body)>25*1024*1024:
        raise ValueError('25MB 이하의 PDF 파일을 선택해주세요.')
    dt.date.fromisoformat(effective_from)
    if not version.strip():raise ValueError('개정 번호 또는 버전을 입력해주세요.')
    manifest=read(site/'data/manifest.json')
    prior=sorted([d for d in manifest['documents'] if d['family']==family],key=lambda d:d['from'])
    if not prior:raise ValueError('등록된 문서 종류를 선택해주세요.')
    old=prior[-1]
    same=digest(body)==old['sha256'] and effective_from==old['from'] and version==old['version']
    if not same and effective_from<=old['from']:
        raise ValueError('새 시행·검색 기준일은 현재 최신 버전보다 뒤여야 합니다. 소급 수정은 별도 검토가 필요합니다.')
    identifier=uuid.uuid4().hex[:16]
    stage=stage_path(identifier)
    stage.mkdir(parents=True)
    (stage/'source.pdf').write_bytes(body)
    base=snapshot_hash(site)
    shutil.copytree(site,stage/'site')
    index=read(safe_path(site,old['data']))
    pages=index['pages'] if same else extract(source)
    if not same:
        expected=re.sub(r'[\s()（）]','',re.sub(r'\(SOP\)','',old['title'],flags=re.I))
        cover=re.sub(r'[\s()（）]','',''.join(p['text'] for p in pages[:5]))
        if expected not in cover:raise ValueError('PDF 표지·머리말에서 선택한 문서명을 확인하지 못했습니다. 문서 종류와 파일을 확인해주세요. 제목 변경은 별도 검토가 필요합니다.')
    write(stage/'pages.json',pages)
    profile=suggested_profile(pages,old['title'],digest(body)) if not same else {'schema':1,'source_sha256':old['sha256'],'reuse_index':True}
    write(stage/'profile.json',profile)
    plan={'schema':1,'id':identifier,'created_at':stamp(),'family':family,'base_snapshot':base,
        'engine_sha256':engine_hash(),'source_sha256':digest(body),'old':old,'no_change':same,
        'new_version':version,'new_from':effective_from,'date_note':date_note,'page_changes':page_changes(index['pages'],pages),
        'removed_pages':sorted({n for c in page_changes(index['pages'],pages) if c['kind']=='delete' for n in c['old_pages']}),
        'source_site':str(site), 'changed_pages':sorted({n for c in page_changes(index['pages'],pages) for n in c['new_pages']})}
    write(stage/'plan.json',plan)
    try:return rebuild(identifier)
    except ValueError as error:
        plan['prepare_warning']=str(error);write(stage/'plan.json',plan);return plan

def rebuild(identifier, profile=None):
    stage=stage_path(identifier)
    plan=read(stage/'plan.json')
    if profile is not None:write(stage/'profile.json',profile)
    profile=read(stage/'profile.json')
    if digest((stage/'source.pdf').read_bytes())!=plan['source_sha256']:raise ValueError('후보 PDF가 변경되었습니다.')
    site=stage/'site'
    base=Path(plan['source_site'])
    manifest=read(base/'data/manifest.json')
    if snapshot_hash(base)!=plan['base_snapshot']:raise ValueError('공개 자료가 준비 이후 변경되었습니다. 후보를 다시 준비해주세요.')
    old=plan['old']
    if plan['no_change']:
        if not profile.get('reuse_index'):raise ValueError('동일 파일 재현 검사는 기존 검토 색인을 사용합니다.')
        index=read(safe_path(base,old['data']))
        doc=old.copy()
    else:
        if profile.get('reuse_index'):raise ValueError('개정 PDF에는 이전 색인을 재사용할 수 없습니다.')
        doc={k:v for k,v in old.items() if k not in ('id','pdf','data','data_sha256','data_bytes','article_titles','search_note','date_note')}
        uid=str(uuid.uuid5(uuid.NAMESPACE_URL,plan['family']+'/'+plan['source_sha256']+'/'+plan['new_from']))
        doc.update(id=uid,version=plan['new_version'],**{'from':plan['new_from'],'to':None},
            sha256=plan['source_sha256'],pdf=f'pdf/{uid}.pdf',data=f'data/{uid}.json',pages=len(read(stage/'pages.json')))
        if plan['date_note']:doc['date_note']=plan['date_note']
        index=build_index(read(stage/'pages.json'),doc,profile)
        for d in manifest['documents']:
            if d['id']==old['id']:d['to']=doc['from']
        manifest['documents'].append(doc)
        manifest['generated_at']=stamp()
    body=encoded(index)
    if len(body)>25*1024*1024:raise ValueError('검색 색인이 정적 호스팅의 25MB 제한을 넘었습니다.')
    if not plan['no_change']:
        doc.update(data_sha256=digest(body),data_bytes=len(body),article_titles=[a['title'] for a in index['articles']])
        safe_path(site,doc['data']).write_bytes(body)
        safe_path(site,doc['pdf']).write_bytes((stage/'source.pdf').read_bytes())
    write(site/'data/manifest.json',manifest)
    plan['new']=doc
    plan['candidate_snapshot']=snapshot_hash(site)
    plan['profile_sha256']=digest((stage/'profile.json').read_bytes())
    write(stage/'plan.json',plan)
    return plan

def validate(identifier, node=None):
    stage=stage_path(identifier)
    plan=rebuild(identifier)
    node=node or os.environ.get('NODE_BINARY') or shutil.which('node')
    if not node:raise ValueError('Node.js 22 이상을 찾지 못했습니다.')
    engine_before=engine_hash()
    if (stage/'validation.json').exists():(stage/'validation.json').unlink()
    result=subprocess.run([node,str(ROOT/'tools/validate-update.mjs'),str(stage)],cwd=ROOT,
        capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=300)
    (stage/'validation.log').write_text(result.stdout+'\n'+result.stderr,encoding='utf-8')
    if not (stage/'validation.json').exists():raise ValueError('검사 실행 실패: '+result.stderr[-1000:])
    report=read(stage/'validation.json')
    if engine_hash()!=engine_before or snapshot_hash(stage/'site')!=plan['candidate_snapshot']:
        raise ValueError('검사 도중 코드나 후보 자료가 변경되었습니다. 다시 검사해주세요.')
    report.update(plan_sha256=digest((stage/'plan.json').read_bytes()),candidate_snapshot=plan['candidate_snapshot'],engine_sha256=engine_hash(),
                  profile_sha256=plan['profile_sha256'],created_at=stamp())
    write(stage/'validation.json',report)
    return report

def approve(identifier, checked_pages, accepted_questions, note, checks):
    stage=stage_path(identifier)
    plan=read(stage/'plan.json')
    report=read(stage/'validation.json')
    if report.get('plan_sha256')!=digest((stage/'plan.json').read_bytes()):raise ValueError('검사 후 후보 계획이 변경되었습니다.')
    if not report['passed']:raise ValueError('검사 실패 항목을 해결한 후 검토 완료할 수 있습니다.')
    if not set(plan['changed_pages']).issubset({int(n) for n in checked_pages if str(n).isdigit()}):raise ValueError('변경된 페이지를 모두 대조해주세요.')
    if not {'old:'+str(n) for n in plan.get('removed_pages',[])}.issubset(set(map(str,checked_pages))):raise ValueError('삭제된 기존 페이지를 모두 대조해주세요.')
    if not set(q['id'] for q in report['question_changes']).issubset(set(accepted_questions)):
        raise ValueError('검색 결과가 달라진 질문을 모두 검토해주세요.')
    if not all(checks.get(k) for k in ('metadata','boundaries','conditions')):
        raise ValueError('시행일·원문, 별표/그림 경계, 적용 조건 검토를 확인해주세요.')
    review={'at':stamp(),'validation_sha256':digest((stage/'validation.json').read_bytes()),
        'checked_pages':checked_pages,'accepted_questions':accepted_questions,'checks':checks,'note':note}
    write(stage/'review.json',review)
    return review

def apply(identifier):
    stage=stage_path(identifier)
    plan,report,review=(read(stage/name) for name in ('plan.json','validation.json','review.json'))
    site=Path(plan['source_site'])
    if report.get('plan_sha256')!=digest((stage/'plan.json').read_bytes()):raise ValueError('검사 후 후보 계획이 변경되었습니다.')
    if not report['passed'] or review['validation_sha256']!=digest((stage/'validation.json').read_bytes()):
        raise ValueError('유효한 검사·검토 완료 기록이 필요합니다.')
    if snapshot_hash(site)!=plan['base_snapshot']:raise ValueError('공개 자료가 변경되었습니다. 다시 준비해주세요.')
    if engine_hash()!=report['engine_sha256'] or snapshot_hash(stage/'site')!=report['candidate_snapshot']:
        raise ValueError('검사 후 코드나 후보 자료가 변경되었습니다. 다시 검사해주세요.')
    if digest((stage/'profile.json').read_bytes())!=report['profile_sha256']:
        raise ValueError('검사 후 검토 프로필이 변경되었습니다.')
    shutil.copyfile(site/'data/manifest.json',stage/'before-manifest.json')
    if plan['no_change']:return {'no_change':True,'message':'동일 PDF 재현 검사입니다. 공개본을 변경하지 않았습니다.'}
    doc=plan['new']
    # Immutable files first; manifest is the single visibility switch, replaced last.
    for key in ('pdf','data'):
        target=safe_path(site,doc[key])
        if target.exists():
            if target.read_bytes()!=safe_path(stage/'site',doc[key]).read_bytes():raise ValueError('동일 버전 경로에 다른 파일이 있습니다.')
        else:shutil.copyfile(safe_path(stage/'site',doc[key]),target)
    write(ROOT/'maintenance/profiles'/f'{doc["sha256"]}.json',read(stage/'profile.json'))
    receipt={'schema':1,'status':'applied','id':identifier,'applied_at':stamp(),'family':plan['family'],
        'before_sha256':plan['old']['sha256'],'after_sha256':doc['sha256'],'from':doc['from'],
        'candidate_snapshot':report['candidate_snapshot'],'checks_passed':True,
        'changed_pages':len(plan['changed_pages']),'changed_questions':len(report['question_changes'])}
    write(ROOT/'maintenance/releases'/f'{identifier}.json',receipt)
    write(stage/'applied.json',receipt)
    pending=site/'data/manifest.pending'
    shutil.copyfile(stage/'site/data/manifest.json',pending)
    os.replace(pending,site/'data/manifest.json')
    return receipt

def rollback(identifier):
    stage=stage_path(identifier)
    plan=read(stage/'plan.json')
    if not (stage/'applied.json').exists():raise ValueError('반영된 후보가 아닙니다.')
    site=Path(plan['source_site'])
    if snapshot_hash(site)!=read(stage/'applied.json')['candidate_snapshot']:
        raise ValueError('반영 후 자료가 변경되었습니다. 이후 갱신을 덮어쓸 수 없습니다.')
    pending=site/'data/manifest.pending'
    shutil.copyfile(stage/'before-manifest.json',pending)
    os.replace(pending,site/'data/manifest.json')
    write(stage/'rollback.json',{'at':stamp()})
    receipt=read(stage/'applied.json');receipt['status']='rolled_back'
    write(ROOT/'maintenance/releases'/f'{identifier}.json',receipt)
    return {'message':'이전 공개 목록으로 복원했습니다. 새 PDF 파일은 이력 보존을 위해 남겨둡니다.'}
