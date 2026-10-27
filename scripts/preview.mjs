import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

// Same loopback origin/path preserves the browser's existing local data.
const root=fileURLToPath(new URL('..',import.meta.url));
process.chdir(root);
const args=process.argv.slice(2);
if(args.length!==0&&!(args.length===2&&args[0]==='--port'))throw Error('Usage: node scripts/preview.mjs [--port 8765]');
const port=args.length?Number(args[1]):8765;
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Port must be an integer from 1024 through 65535');
await import('./prepare-site.mjs');
const site=path.join(root,'_site'),prefix='/ai-desk-hub/';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.tflite':'application/octet-stream','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.md':'text/plain; charset=utf-8'};
const run=promisify(execFile);
let topicsCache=null,topicsPending=null;
async function publicTopics(){
  if(!topicsCache){try{topicsCache=JSON.parse(await readFile(path.join(site,'topics-feed.json'),'utf8'));}catch{}}
  if(topicsCache&&Date.now()-Date.parse(topicsCache.generatedAt)<30*60000&&!topicsCache.refreshError)return {...topicsCache,delivery:'local-live'};
  if(!topicsPending)topicsPending=(async()=>{
    try{
      const {stdout}=await run('python3',[path.join(root,'scripts/collect-topics.py')],{cwd:root,timeout:14000,maxBuffer:2000000});
      const data=JSON.parse(stdout);
      if(data.schemaVersion!==1||!data.sources.some(s=>s.ok))throw Error('No available feed');
      topicsCache=data;return {...data,delivery:'local-live'};
    }catch{
      if(topicsCache)return {...topicsCache,delivery:'local-live',refreshError:true};
      throw Error('Topics unavailable');
    }finally{topicsPending=null;}
  })();
  return topicsPending;
}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'}).end();return;}
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/'||url.pathname==='/ai-desk-hub'){res.writeHead(302,{'Location':prefix+url.search}).end();return;}
    if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return;}
    if(url.pathname===prefix+'topics-feed.json'){
      const payload=Buffer.from(JSON.stringify(await publicTopics()));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Length':payload.length});res.end(req.method==='HEAD'?undefined:payload);return;
    }
    const name=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html';
    const file=path.resolve(site,name);
    if(!file.startsWith(site+path.sep)||!(await stat(file)).isFile()){res.writeHead(404).end();return;}
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':data.length});
    res.end(req.method==='HEAD'?undefined:data);
  }catch(error){res.writeHead(error instanceof URIError?400:404).end();}
});
server.on('error',error=>{console.error('Preview failed: '+error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log('Local preview: http://localhost:'+port+prefix+' (only _site files; keep this process running)'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
