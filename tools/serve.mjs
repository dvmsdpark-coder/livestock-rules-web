import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../site/',import.meta.url));
const port=Number(process.argv.find(a=>a.startsWith('--port='))?.split('=')[1]||4173);
const base=process.argv.find(a=>a.startsWith('--base='))?.split('=')[1]||'/';
if(!/^\/[a-zA-Z0-9_\-/]*\/$/u.test(base)&&base!=='/')throw Error('Invalid preview base path');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.pdf':'application/pdf'};
const server=http.createServer((req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!pathname.startsWith(base)){res.writeHead(404);res.end();return;}
  const rel=pathname.slice(base.length)||'index.html',file=path.resolve(root,rel);
  if(!file.startsWith(path.resolve(root)+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(400);res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log(`Static preview: http://localhost:${port}${base}`));
