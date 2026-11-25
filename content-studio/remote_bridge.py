"""Outbound-only private relay. No public port, browser credential, or provider key is shared."""
from pathlib import Path
import concurrent.futures
import hashlib
import json
import os
import threading
import time
import httpx
from store import DATA

CONFIG=DATA/'remote'/'config.json'
CHUNK=262144
STOP=threading.Event()

class Bridge:
    def __init__(self,config):
        self.config=config
        self.remote=httpx.Client(base_url=config['url'],headers={'Authorization':'Bearer '+config['machine_token'],'User-Agent':'AI-Desk-Hub-Studio/0.17.0'},timeout=45,proxy=os.environ.get('STUDIO_PROXY'),trust_env=False)
        self.local=httpx.Client(trust_env=False,base_url='http://127.0.0.1:8876',headers={'Authorization':'Bearer '+(DATA/'access-token').read_text().strip()},timeout=600)
        self.receipts=DATA/'remote'/'receipts';self.receipts.mkdir(exist_ok=True,mode=0o700)
        self.snapshot_lock=threading.Lock();self.last_snapshot={}
        self.pending_receipts={p.stem:p for p in self.receipts.glob('*.json') if not json.loads(p.read_text()).get('acked')}
    def send(self,path,method='GET',**kwargs):
        response=self.remote.request(method,path,**kwargs);response.raise_for_status();return response.json()
    def snapshot(self):
        with self.snapshot_lock:
            topics=self.local.get('/api/topics');topics.raise_for_status();rows=topics.json()
            # Rendering-local paths and generation internals stay on the Mac.
            for row in rows:
                row['plan']={k:v for k,v in row['plan'].items() if k not in {'production_assets','edit_shots','production_authorization','edit_authorization','production_recipe'}}
            runs=self.local.get('/api/runs');runs.raise_for_status()
            jobs=self.local.get('/api/jobs');jobs.raise_for_status();jobs=jobs.json()
            for job in jobs:
                job.pop('snapshot',None)
                manifest=DATA/job['id']/'media-sources.json'
                if manifest.exists():
                    entries=json.loads(manifest.read_text());job['sources']=[{k:v for k,v in entry.items() if k in {'scene','shot','index','start','end','seconds','source','source_asset','credit','kind','label'}} for entry in entries]
            for name,value in [('topics',rows),('runs',runs.json()),('jobs',jobs)]:
                encoded=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode();digest=hashlib.sha256(encoded).hexdigest()
                if self.last_snapshot.get(name)!=digest:
                    self.send('/internal/snapshot','PUT',json={'name':name,'data':value});self.last_snapshot[name]=digest
    def heartbeat(self):
        while not STOP.is_set():
            try:
                self.local.get('/health').raise_for_status()
                self.send('/internal/heartbeat','PUT',json={'schedule':os.environ.get('STUDIO_SCHEDULE')=='true'})
                self.snapshot()
            except Exception as exc:self.report('heartbeat',exc)
            STOP.wait(20)
    @staticmethod
    def report(stage,exc):
        # No request URLs, credentials, raw content, or provider payloads in logs.
        p=DATA/'remote'/('status-'+stage+'.json');tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps({'stage':stage,'error_type':type(exc).__name__,'http_status':getattr(getattr(exc,'response',None),'status_code',None),'at':time.time()}));tmp.replace(p)
    def process(self,command):
        receipt=self.receipts/(command['id']+'.json')
        if receipt.exists():
            saved=json.loads(receipt.read_text())
            result=saved.get('result') or {'status':409,'data':{'detail':'上次处理意外中断，请刷新检查结果后重试，未自动重复执行。'}}
        else:
            receipt.write_text(json.dumps({'started_at':time.time()}));receipt.chmod(0o600)
            try:
                r=self.local.request(command['method'],command['path'],json=command['body'])
                try:data=r.json()
                except ValueError:data={'detail':'Mac 返回格式异常，请刷新检查'}
                result={'status':r.status_code,'data':data}
            except Exception as exc:
                result={'status':503,'data':{'detail':'Mac 处理未能确认，请刷新检查后重试。'}};self.report('command',exc)
            receipt.write_text(json.dumps({'result':result},ensure_ascii=False))
        self.pending_receipts[command['id']]=receipt
        self.publish_receipts()
    def publish_receipts(self):
        for ident,receipt in list(self.pending_receipts.items()):
            saved=json.loads(receipt.read_text())
            result=saved.get('result') or {'status':409,'data':{'detail':'上次处理意外中断，请刷新核对；未自动重复执行。'}}
            # Upload the committed state before confirming success. Retry only the receipt, never the action.
            self.snapshot()
            self.send('/internal/result/'+ident,'PUT',json=result)
            receipt.write_text(json.dumps({'result':result,'acked':True},ensure_ascii=False))
            del self.pending_receipts[ident]
    def commands(self):
        while not STOP.is_set():
            try:
                self.publish_receipts()
                command=self.send('/internal/pull','POST',json={}).get('command')
                if command:self.process(command)
                else:STOP.wait(5)
            except Exception as exc:self.report('commands',exc);STOP.wait(10)
    def media(self):
        while not STOP.is_set():
            try:
                jobs=self.local.get('/api/jobs');jobs.raise_for_status()
                # Only the latest two reviewable cuts. Rejected/test history is not copied wholesale.
                ready={m['job']:m for m in self.send('/internal/media')}
                eligible=[j for j in jobs.json() if j['status']=='complete' and j.get('review')!='rejected']
                requested=self.send('/internal/media-requests')
                eligible=sorted([j for j in eligible if j['id'] in requested],key=lambda j:requested.index(j['id']))+[j for j in eligible[:2] if j['id'] not in requested]
                for job in eligible:
                    path=DATA/job['id']/'video.mp4'
                    if not path.exists():continue
                    digest=hashlib.sha256(path.read_bytes()).hexdigest();size=path.stat().st_size
                    if ready.get(job['id'],{}).get('sha256')==digest and ready[job['id']]['status']=='ready':continue
                    info={'size':size,'parts':(size+CHUNK-1)//CHUNK,'sha256':digest,'status':'uploading'}
                    self.send('/internal/media/'+job['id'],'PUT',json=info)
                    uploaded=set(self.send('/internal/media/'+job['id']).get('uploaded',[]))
                    def upload(part):
                        with path.open('rb') as f:f.seek(part*CHUNK);chunk=f.read(CHUNK)
                        for attempt in range(5):
                            try:self.send('/internal/media/'+job['id']+'/'+str(part),'PUT',content=chunk,headers={'Content-Type':'application/octet-stream'});return
                            except Exception:
                                if attempt==4:raise
                                time.sleep(2**attempt)
                    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(upload,[n for n in range(info['parts']) if n not in uploaded]))
                    info['status']='ready';self.send('/internal/media/'+job['id'],'PUT',json=info)
            except Exception as exc:self.report('media',exc)
            STOP.wait(20)

def start():
    if not CONFIG.exists():return
    try:
        config=json.loads(CONFIG.read_text())
        if not config.get('enabled'):return
        bridge=Bridge(config)
        for target in [bridge.heartbeat,bridge.commands,bridge.media]:threading.Thread(target=target,daemon=True).start()
    except Exception as exc:Bridge.report('startup',exc)
