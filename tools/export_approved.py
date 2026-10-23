"""Run inside the existing API container; stdout is a public-only ZIP.

No secrets, drafts, review notes, sessions, or database archives are exported.
The local application stays the authoritative document approval workspace.
"""
import datetime,hashlib,json,re,sys,zipfile
from pathlib import Path
from app.db import db
from app.articles import parse_articles
from supplemental import PROFILES, excluded, curated_procedures, parse_annexes, ANNEX as HEADER
from app.articles import page_body
from app.procedures import parse_sop,reporting_parts,matching_section
from app.core import readable_excerpt,chunk_page


def definition(text,term):
    match=re.search(r'(?<![가-힣A-Za-z0-9])(?:[“"「『]\s*)?'+re.escape(term)+r'\s*[”"」』]?\s*(?:이란|란|이라\s*함은|라\s*함은)\s*',text)
    if not match:return None
    start=text.rfind('\n',0,match.start())+1
    prefix=text[start:match.start()]
    headings=list(re.finditer(r'제\s*\d+\s*조(?:의\s*\d+)?\s*\(([^\n)]{1,90})\)',text[:match.start()]))
    if headings and '정의' not in headings[-1].group(1):return None
    if not re.fullmatch(r'[ \t]*(?:(?:\d+\.|[①-⑳])[ \t]*)?',prefix):return None
    if not re.fullmatch(r'[ \t]*\d+\.[ \t]*',prefix):start=match.start()
    following=re.search(r'(?m)^[ \t]*(?:\d+\.[ \t]+|[①-⑳]|제[ \t]*\d+[ \t]*조|부칙|(?:[■□][^\n]*)?\[별(?:표|지))',text[match.end():])
    end=match.end()+following.start() if following else len(text)
    excerpt=text[start:end].strip()
    if len(excerpt)>16000 or not re.search(r'(?:말한다|뜻한다|의미한다)\.',excerpt):return None
    if not following and (not re.search(r'[.!?。>\]]$',excerpt) or re.search(r'(?m)^[ \t]*[가-힣]\.[ \t]+',excerpt)):return None
    return excerpt


def chapter_for(pages,part):
    context=''
    for page in pages:
        if page['page']>part['page']:break
        text=page['text_content']
        if page['page']==part['page']:
            offset=text.find(part['text_content'])
            text=text[:offset] if offset>=0 else ''
        headers=list(re.finditer(r'(?m)^[ \t]*제\s*\d+\s*장[^\n]*',text))
        if headers:context=headers[-1].group().strip()
    return context


def export():
    with db() as c:
        c.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        documents=c.execute("""SELECT id,family_key,title,doc_type,disease,version_label,effective_from,effective_to,pages,sha256,storage_path
            FROM documents WHERE status='active' ORDER BY CASE doc_type WHEN '법률' THEN 0 WHEN '시행령' THEN 1 WHEN '시행규칙' THEN 2 WHEN '고시' THEN 3 ELSE 4 END,title,id""").fetchall()
        manifest={'schema':1,'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'documents':[]}
        files={}
        for doc in documents:
            uid=str(doc['id'])
            pending=c.execute('SELECT count(*) AS n FROM document_pages WHERE document_id=%s AND needs_review AND NOT reviewed',(uid,)).fetchone()['n']
            if pending:raise ValueError('An active document has unreviewed pages')
            source=Path(doc['storage_path'])
            if source.resolve().parent!=Path('/data/pdfs').resolve():raise ValueError('Invalid PDF path')
            body=source.read_bytes()
            if hashlib.sha256(body).hexdigest()!=doc['sha256']:raise ValueError('PDF hash mismatch')
            if len(body)>25*1024*1024:raise ValueError('PDF exceeds static-host asset limit')
            pages=c.execute('SELECT page,text_content,text_origin,raw_text FROM document_pages WHERE document_id=%s ORDER BY page',(uid,)).fetchall()
            if len(pages)!=doc['pages']:raise ValueError('Incomplete document')
            for page in pages:
                # Native text is more trustworthy than OCR for sparse diagrams.
                # Do not export garbled OCR when the PDF already has a title.
                if page['text_origin']=='ocr' and page['raw_text'].strip():
                    page['text_content']=page['raw_text'].replace('\ufffd',' ').replace('\x00',' ')
                    page['text_origin']='pdf'
            public={'id':uid,'family':doc['family_key'],'title':doc['title'],'type':doc['doc_type'],'disease':doc['disease'],
                'version':doc['version_label'],'from':str(doc['effective_from']),'to':str(doc['effective_to']) if doc['effective_to'] else None,
                'pages':doc['pages'],'sha256':doc['sha256'],'pdf':f'pdf/{uid}.pdf','data':f'data/{uid}.json'}
            if doc['family_key']=='fmd-sop':public['date_note']='검색용 기준일은 파일명 기준이며 공식 시행일은 미확인입니다.'
            if doc['family_key'] in ('asf-sop','hpai-sop'):
                public['date_note']='SOP 발행 연월은 표지 기준입니다. 검색용 기준일은 제공 파일명 날짜이며 공식 시행일은 미확인입니다. 최신 고시와 함께 확인하세요.'
            profile=PROFILES.get(doc['sha256'],{})
            if doc['family_key'] in ('asf-sop','hpai-sop') and not profile:
                raise ValueError('New SOP revision requires source-boundary and appendix review')
            if doc['family_key']=='asf-sop':
                public['search_note']='부록의 과거 고시·2019년 WOAH 번역문은 현행 근거로 검색하지 않습니다. 전체 자료는 PDF에서 볼 수 있습니다.'
            search_pages=[p for p in pages if not excluded(profile,p['page'])]
            index={'pages':[],'articles':[],'definitions':[],'annexes':[],'procedures':[],'chunks':[]}
            by_page={p['page']:p['text_content'] for p in pages}
            reference='\n'.join(p['text_content'] for p in pages)
            def record(part,heading,**extra):
                text=part['text_content']
                if text not in by_page[part['page']]:raise ValueError('Excerpt is not a source substring')
                return {'page':part['page'],'text':text,'display':readable_excerpt(text,reference),'origin':part.get('text_origin','pdf'),'heading':heading,**extra}
            if doc['doc_type']!='SOP':
                for article in parse_articles(pages,doc['title']):
                    parts=[record(p,article['heading'],scenario=chapter_for(pages,p),continued=i>0) for i,p in enumerate(article['parts'])]
                    index['articles'].append({'number':article['number'],'title':article['title'],'parts':parts})
                seen=set()
                for page in pages:
                    terms=set(re.findall(r'[“"「『]([^\n“”"「」『』]{1,60})[”"」』]\s*(?:이란|란|이라\s*함은|라\s*함은)',page['text_content']))
                    for term in sorted(terms):
                        excerpt=definition(page['text_content'],term)
                        signature=(term,re.sub(r'\s+','',excerpt or ''))
                        if not excerpt or signature in seen:continue
                        seen.add(signature)
                        index['definitions'].append({'term':term,'part':record({**page,'text_content':excerpt},'정의 · '+term)})
                # A definition can continue onto the next physical PDF page.
                # Parse across the complete article, then retain page-local source slices.
                for article in index['articles']:
                    if article['title']!='정의':continue
                    joined='\n'.join(p['text'] for p in article['parts'])
                    terms=set(re.findall(r'[“"「『]([^\n“”"「」『』]{1,60})[”"」』]\s*(?:이란|란|이라\s*함은|라\s*함은)',joined))
                    for term in sorted(terms):
                        if any(d['term']==term for d in index['definitions']):continue
                        excerpt=definition(joined,term)
                        if not excerpt:continue
                        start=joined.find(excerpt);end=start+len(excerpt);offset=0;parts=[]
                        for p in article['parts']:
                            left=max(start,offset);right=min(end,offset+len(p['text']))
                            if right>left:
                                text=p['text'][left-offset:right-offset]
                                parts.append(record({'page':p['page'],'text_content':text,'text_origin':p['origin']},'정의 · '+term,continued=bool(parts)))
                            offset+=len(p['text'])+1
                        if parts:index['definitions'].append({'term':term,'part':parts[0],'parts':parts})
            annex_pages=[]
            for page in search_pages:
                body_text=page_body(page['text_content'],doc['title'])
                headers=list(HEADER.finditer(body_text))
                if len(headers)>=3 and not HEADER.sub('',body_text).strip():continue
                annex_pages.append(page)
            for annex in parse_annexes(annex_pages,doc['title']):
                first=annex['parts'][0]
                # Blank leading continuation is not useful as a search result.
                if not first['text_content'].strip():continue
                index['annexes'].append({'kind':annex['section_kind'],'number':list(annex['number']),'heading':annex['heading'],
                    'deleted':annex['deleted'],'endPage':annex['parts'][-1]['page'],'part':record(first,annex['heading'])})
            if doc['doc_type']=='SOP' and doc['disease']=='구제역':
                for section in parse_sop(pages):
                    for intent in ('reporting','movement_release','farm_disinfection'):
                        if not matching_section(section,intent):continue
                        parts=reporting_parts(section['parts']) if intent=='reporting' else section['parts']
                        index['procedures'].append({'intent':intent,'scenario':section['scenario'],
                            'parts':[record(p,section['heading'],scenario=section['scenario'],continued=i>0) for i,p in enumerate(parts)]})
            for section in curated_procedures(pages,profile):
                index['procedures'].append({'intent':section['intent'],'scenario':section['scenario'],
                    'parts':[record(p,section['heading'],scenario=section['scenario'],continued=i>0) for i,p in enumerate(section['parts'])]})
            for page in pages:
                index['pages'].append({'page':page['page'],'text':page['text_content']})
                if excluded(profile,page['page']):continue
                for heading,excerpt in chunk_page(page['text_content']):
                    index['chunks'].append(record({**page,'text_content':excerpt},heading))
            # Classify page candidates once rather than reparse for each chunk.
            page_kind={}
            for annex in index['annexes']:
                for number in range(annex['part']['page'],annex['endPage']+1):page_kind[number]=annex['kind']
            for chunk in index['chunks']:
                chunk['kind']=page_kind.get(chunk['page'],'figure' if len(re.sub(r'\s','',by_page[chunk['page']]))<30 else 'body')
            encoded=json.dumps(index,ensure_ascii=False,separators=(',',':')).encode()
            if len(encoded)>25*1024*1024:raise ValueError('Index exceeds asset size limit')
            public['data_sha256']=hashlib.sha256(encoded).hexdigest();public['data_bytes']=len(encoded)
            public['article_titles']=[a['title'] for a in index['articles']]
            files[public['data']]=encoded;files[public['pdf']]=body
            manifest['documents'].append(public)
        files['data/manifest.json']=json.dumps(manifest,ensure_ascii=False,indent=2).encode()
    with zipfile.ZipFile(sys.stdout.buffer,'w',zipfile.ZIP_DEFLATED) as z:
        for name,body in files.items():z.writestr(name,body)


if __name__=='__main__':export()
