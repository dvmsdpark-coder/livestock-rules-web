"""Loopback-only maintenance UI and CLI. Never deploy this server publicly."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import threading
import traceback
from urllib.parse import urlparse, parse_qs
from update_core import ROOT, PRIVATE, read, write, prepare, stage_path, rebuild, validate, approve, apply, rollback, safe_path

TOKEN=secrets.token_urlsafe(32)
JOB={'busy':False,'message':'','error':None,'result':None}
LOCK=threading.Lock()

def launch(action):
    with LOCK:
        if JOB['busy']:raise ValueError('다른 작업이 진행 중입니다.')
        JOB.update(busy=True,error=None,result=None,message='처리 중입니다. 공개 자료는 반영 버튼을 누르기 전까지 변경되지 않습니다.')
    def work():
        try:
            result=action()
            with LOCK:JOB.update(result=result,message='완료했습니다.')
        except Exception as error:
            with LOCK:JOB.update(error=str(error),message='확인이 필요합니다.')
        finally:
            with LOCK:JOB['busy']=False
    threading.Thread(target=work,daemon=True).start()

class Handler(BaseHTTPRequestHandler):
    server_version='LocalUpdateManager'
    def log_message(self,*args):pass
    def respond(self,status,body,kind='application/json; charset=utf-8'):
        payload=body if isinstance(body,bytes) else json.dumps(body,ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type',kind)
        self.send_header('Content-Length',str(len(payload)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'")
        self.end_headers();self.wfile.write(payload)
    def allowed(self,mutation=False):
        host=f'127.0.0.1:{self.server.server_port}'
        if self.headers.get('Host')!=host:return False
        if mutation and (self.headers.get('Origin')!=f'http://{host}' or self.headers.get('X-Update-Token')!=TOKEN):return False
        return True
    def do_GET(self):
        if not self.allowed():return self.respond(403,{'error':'로컬 관리 주소를 사용해주세요.'})
        url=urlparse(self.path);query=parse_qs(url.query)
        try:
            if url.path=='/':
                html=(ROOT/'tools/update-ui.html').read_text(encoding='utf-8').replace('__TOKEN__',TOKEN)
                return self.respond(200,html.encode(),'text/html; charset=utf-8')
            if url.path=='/api/catalog':
                manifest=read(ROOT/'site/data/manifest.json')
                docs={}
                for d in sorted(manifest['documents'],key=lambda d:d['from']):docs[d['family']]=d
                return self.respond(200,{'documents':list(docs.values())})
            if url.path=='/api/status':
                with LOCK:return self.respond(200,JOB.copy())
            if url.path=='/api/stage':
                stage=stage_path(query['id'][0]);plan=read(stage/'plan.json')
                old=read(safe_path(Path(plan['source_site']),plan['old']['data']))['pages']
                return self.respond(200,{'plan':{k:v for k,v in plan.items() if k!='source_site'},
                    'profile':read(stage/'profile.json'),'pages':read(stage/'pages.json'),'old_pages':old,
                    'validation':read(stage/'validation.json') if (stage/'validation.json').exists() else None})
            if url.path=='/pdf':
                stage=stage_path(query['id'][0]);plan=read(stage/'plan.json')
                target=safe_path(Path(plan['source_site']),plan['old']['pdf']) if query.get('old') else stage/'source.pdf'
                return self.respond(200,target.read_bytes(),'application/pdf')
            return self.respond(404,{'error':'없는 주소입니다.'})
        except Exception as error:return self.respond(400,{'error':str(error)})
    def do_POST(self):
        if not self.allowed(True):return self.respond(403,{'error':'관리 화면에서만 실행할 수 있습니다.'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=26*1024*1024:return self.respond(413,{'error':'입력 크기를 확인해주세요.'})
            body=self.rfile.read(length)
            if self.path=='/api/prepare':
                metadata=json.loads(self.headers.get('X-Document-Metadata','{}'))
                incoming=PRIVATE/'incoming';incoming.mkdir(parents=True,exist_ok=True)
                upload=incoming/(secrets.token_hex(12)+'.pdf');upload.write_bytes(body)
                def create():
                    try:return {'id':prepare(upload,**metadata)['id']}
                    finally:upload.unlink(missing_ok=True)
                launch(create)
            else:
                data=json.loads(body);identifier=data['id']
                if self.path=='/api/validate':
                    def check():
                        rebuild(identifier,data['profile'])
                        return {'id':identifier,'validation':validate(identifier)}
                    launch(check)
                elif self.path=='/api/apply':
                    def commit():
                        approve(identifier,data['checked_pages'],data['accepted_questions'],data.get('note',''),data['checks'])
                        return {'id':identifier,'applied':apply(identifier)}
                    launch(commit)
                elif self.path=='/api/rollback':launch(lambda:{'id':identifier,'rollback':rollback(identifier)})
                else:return self.respond(404,{'error':'없는 작업입니다.'})
            return self.respond(202,{'started':True})
        except Exception as error:return self.respond(400,{'error':str(error)})

def main():
    parser=argparse.ArgumentParser(description='로컬 PDF 갱신 관리. 기본값: 브라우저 관리 화면')
    parser.add_argument('--port',type=int,default=4175)
    parser.add_argument('--prepare',metavar='PDF')
    parser.add_argument('--family');parser.add_argument('--version');parser.add_argument('--from',dest='effective_from')
    parser.add_argument('--validate',metavar='ID');parser.add_argument('--rollback',metavar='ID')
    args=parser.parse_args()
    if args.prepare:
        print(json.dumps(prepare(args.prepare,args.family,args.version,args.effective_from),ensure_ascii=False,indent=2));return
    if args.validate:print(json.dumps(validate(args.validate),ensure_ascii=False,indent=2));return
    if args.rollback:print(json.dumps(rollback(args.rollback),ensure_ascii=False,indent=2));return
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'문서 갱신 관리: http://127.0.0.1:{args.port}/',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:server.server_close()

if __name__=='__main__':main()
