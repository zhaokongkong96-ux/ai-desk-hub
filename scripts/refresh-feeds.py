"""Daily public feeds for Pages. Credentials are read only from the runner environment."""
import hotlist
import argparse, concurrent.futures, datetime as dt, importlib.util, json, os, re, urllib.parse, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
ZONE=dt.timezone(dt.timedelta(hours=8))
UPSTREAM='https://raw.githubusercontent.com/s87343472/awesome-ai-hardware/main/data/projects.json'
PUBLIC='https://zhaokongkong96-ux.github.io/ai-desk-hub/'
AUTOMATION=dict(enabled=True,timezone='Asia/Shanghai',scheduledAt='08:17',platform='GitHub Actions')
QUERIES=[('"AI" "hardware" stars:>20 archived:false fork:false','edge-ai'),('"voice assistant" esp32 stars:>5 archived:false fork:false','voice-assistants'),('"robot" "AI" stars:>50 archived:false fork:false','robotics'),('"companion" raspberry stars:>5 archived:false fork:false','creative-hardware')]
def fetch_json(url):
    headers={'User-Agent':'AI-Desk-Hub-daily-feeds','Accept':'application/vnd.github+json' if url.startswith('https://api.github.com/') else 'application/json'}
    token=os.environ.get('GITHUB_TOKEN')
    if token and url.startswith('https://api.github.com/'):
        headers['Authorization']='Bearer '+token
        headers['X-GitHub-Api-Version']='2022-11-28'
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=12) as r:
        raw=r.read(3_000_001)
    if len(raw)>3_000_000:raise ValueError('Oversized public feed')
    return json.loads(raw)
def load_previous(name,restore=False):
    try:local=json.loads((ROOT/name).read_text())
    except (OSError,ValueError):local={}
    if restore:
        try:
            published=fetch_json(PUBLIC+name+'?refresh='+str(int(dt.datetime.now().timestamp())))
            if published.get('schemaVersion')==1 and str(published.get('generatedAt',''))>=str(local.get('generatedAt','')):return published
        except Exception:pass
    return local
def valid_repo(project):
    if not isinstance(project,dict) or not isinstance(project.get('name'),str):return False
    try:
        u=urllib.parse.urlsplit(project.get('repo_url',''))
        return u.scheme=='https' and u.hostname=='github.com' and not u.username and not u.password and bool(re.fullmatch(r'/[\w.-]+/[\w.-]+/?',u.path))
    except ValueError:return False

def refresh_topics(previous):
    spec=importlib.util.spec_from_file_location('desk_collect_topics',ROOT/'scripts/collect-topics.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    data=module.collect();now=dt.datetime.now(ZONE).isoformat()
    if not any(s['ok'] for s in data['sources']):
        if not previous.get('items'):raise ValueError('No topic source available and no previous snapshot')
        return {**previous,'refreshError':True,'attemptedAt':now,'sources':data['sources']},False
    failed={s['name'] for s in data['sources'] if not s['ok']};ids={i['id'] for i in data['items']}
    data['items'] += [i for i in previous.get('items',[]) if i.get('feed') in failed and i.get('id') not in ids][:48]
    old_status={s.get('id'):s for s in previous.get('sources',[])}
    for source in data['sources']:
        source['lastSuccessAt']=now if source['ok'] else old_status.get(source['id'],{}).get('lastSuccessAt',previous.get('generatedAt'))
    return data,True

def search(spec):
    query,category=spec
    try:
        data=fetch_json('https://api.github.com/search/repositories?'+urllib.parse.urlencode(dict(q=query+' in:name,description',sort='updated',order='desc',per_page=6)))
        if not isinstance(data.get('items'),list):raise ValueError('Invalid search')
        found=[]
        for r in data['items']:
            if r.get('private') or r.get('archived') or r.get('fork'):continue
            if re.search(r'jobs?|internship|interview|awesome|roadmap|course|tutorial|hiring',r.get('name',''),re.I):continue
            text=' '.join([r.get('name',''),r.get('description') or '', ' '.join(r.get('topics') or [])]).lower()
            if not re.search(r'esp32|raspberry|robot|microcontroller|npu|qualcomm|esphome|wearable|arduino|fpga|embedded|pcb|smart.home|servo|3d.print|\bcad\b',text):continue
            actual_category='robotics' if re.search(r'robot|servo',text) else 'voice-assistants' if re.search(r'voice|speech|tts|wake.word',text) else category
            license=r.get('license') or {}
            p=dict(id='github-'+str(r['id']),name=r['full_name'],repo_url=r['html_url'],category=actual_category,description_en=r.get('description') or '仓库未提供简介，请查看原仓库。',ai_role='GitHub 关键词自动发现，AI 作用与复现条件待回源核验。',hardware_role='自动发现，硬件与物料清单待核验。',license=license.get('spdx_id') or '未标注',origin='github-discovery',stars=r.get('stargazers_count',0),forks=r.get('forks_count',0),language=r.get('language'),pushed_at=r.get('pushed_at'),updated_at=r.get('updated_at'),tags=r.get('topics') or [])
            if valid_repo(p):found.append(p)
        return found,dict(query=query,ok=True,incomplete=bool(data.get('incomplete_results')),count=len(found))
    except Exception:return [],dict(query=query,ok=False,count=0,error='GitHub 搜索暂不可用')

def refresh_radar(previous):
    now=dt.datetime.now(ZONE).isoformat();sources=[];fresh=False
    try:
        raw=fetch_json(UPSTREAM);curated=[{**p,'origin':'awesome-directory'} for p in raw['projects'] if valid_repo(p)]
        if not curated:raise ValueError('Empty upstream')
        sources.append(dict(id='awesome',name='Awesome AI Hardware',url=UPSTREAM,ok=True,count=len(curated),lastSuccessAt=now));fresh=True
    except Exception:
        curated=[p for p in previous.get('projects',[]) if p.get('origin')!='github-discovery' and valid_repo(p)]
        if not curated:curated=[{**p,'origin':'awesome-directory'} for p in json.loads((ROOT/'projects-seed.json').read_text())['projects'] if valid_repo(p)]
        old=next((s for s in previous.get('sources',[]) if s.get('id')=='awesome'),{})
        sources.append(dict(id='awesome',name='Awesome AI Hardware',url=UPSTREAM,ok=False,count=len(curated),lastSuccessAt=old.get('lastSuccessAt',previous.get('generatedAt')),error='目录读取失败，保留旧快照'))
    discovered=[];checks=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for items,status in pool.map(search,QUERIES):discovered.extend(items);checks.append(status)
    success=any(s['ok'] for s in checks)
    if success:fresh=True
    else:discovered=[p for p in previous.get('projects',[]) if p.get('origin')=='github-discovery' and valid_repo(p)]
    old=next((s for s in previous.get('sources',[]) if s.get('id')=='github-discovery'),{})
    sources.append(dict(id='github-discovery',name='GitHub 每日发现',url='https://api.github.com/search/repositories',ok=success,count=len(discovered),partial=any(not s['ok'] or s.get('incomplete') for s in checks),checks=checks,lastSuccessAt=now if success else old.get('lastSuccessAt',previous.get('generatedAt'))))
    seen={p['repo_url'].rstrip('/').lower() for p in curated};new=[]
    for p in discovered:
        key=p['repo_url'].rstrip('/').lower()
        if key not in seen:seen.add(key);new.append(p)
        if len(new)>=12:break
    data=dict(schemaVersion=1,generatedAt=now if fresh else previous.get('generatedAt','2026-10-19T00:00:00+08:00'),attemptedAt=now,sources=sources,projects=curated+new)
    if not fresh:data['refreshError']=True
    return data,fresh

def refresh(restore=False):
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        topic_future=pool.submit(refresh_topics,load_previous('topics-feed.json',restore))
        radar_future=pool.submit(refresh_radar,load_previous('radar-feed.json',restore))
        hot_future=pool.submit(hotlist.collect,load_previous('hotlist-feed.json',restore),fetch_json)
        topics,t_ok=topic_future.result();radar,r_ok=radar_future.result();hot,h_ok=hot_future.result()
    # Publish explicit failure metadata with original snapshot timestamps, including outages.
    for name,data in [('topics-feed.json',topics),('radar-feed.json',radar),('hotlist-feed.json',hot)]:
        data.update(automation=AUTOMATION,delivery='github-actions-daily',runId=os.environ.get('GITHUB_RUN_ID','local-validation'))
        target=ROOT/name;temp=target.with_suffix('.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');temp.replace(target)
    summary={'topics':len(topics['items']),'topicsFresh':t_ok,'radar':len(radar['projects']),'radarFresh':r_ok,'radarSources':radar['sources'],'hotlist':len(hot['items']),'hotlistFresh':h_ok}
    print(json.dumps(summary,ensure_ascii=False))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as out:out.write('## Daily public feeds\n\n'+json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    return summary
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--restore-published',action='store_true');args=p.parse_args();refresh(args.restore_published)
