"""Bounded GitHub momentum collection; public counts only, never raw discussions."""
import datetime as dt, math, re, time, urllib.error, urllib.parse, urllib.request
ZONE=dt.timezone(dt.timedelta(hours=8))
TRENDING='https://github.com/trending?since=daily'
AI=re.compile(r'\b(ai|llm|agent|agents|gpt|inference|diffusion|transformer|rag|machine.learning|deep.learning|neural)\b',re.I)
def moment(s):
    try:return dt.datetime.fromisoformat(s.replace('Z','+00:00')).astimezone(ZONE)
    except (ValueError,TypeError,AttributeError):return None

def trending():
    with urllib.request.urlopen(urllib.request.Request(TRENDING,headers={'User-Agent':'AI-Desk-Hub'}),timeout=15) as r:
        raw=r.read(3_000_001).decode('utf-8')
    result={}
    for article in re.findall(r'<article\b.*?</article>',raw,re.S):
        heading=re.search(r'<h2\b.*?</h2>',article,re.S)
        repo=re.search(r'href="/([\w.-]+/[\w.-]+)"',heading.group() if heading else '')
        count=re.search(r'([\d,]+)\s+stars today',article)
        if repo and count:result[repo[1].lower()]=int(count[1].replace(',',''))
    if not result:raise ValueError('Trending format unavailable')
    return result

def rank(candidates,history,now):
    cutoff=(now-dt.timedelta(days=7)).date().isoformat();today=now.date().isoformat()
    history=[h for h in history if cutoff<=h.get('date','')<today]
    for p in candidates:
        prior=[h for h in history if p['name'].lower() in h.get('shown',[])]
        samples=[(moment(h.get('collectedAt')),h.get('metrics',{}).get(p['name'].lower(),{})) for h in history]
        samples=[(t,m) for t,m in samples if t and isinstance(m.get('stars'),int) and (now-t).total_seconds()>=6*3600]
        # Prefer the most recent baseline; report the actual elapsed window.
        baseline=max(samples,key=lambda s:s[0]) if samples else None
        p['growth']=None
        if p.get('dailyStars') is not None:p['growth']={'count':p['dailyStars'],'hours':24,'source':'GitHub Trending 今日新增','url':TRENDING}
        elif baseline:
            t,m=baseline;hours=round((now-t).total_seconds()/3600,1)
            p['growth']={'count':max(0,p['stars']-m['stars']),'hours':hours,'source':'两次采集 Star 净增','url':p['url']+'/stargazers'}
        release=p.get('release') or {};published=moment(release.get('publishedAt'))
        # A major update means a newly observed stable major-version release, not a push.
        is_major=bool(re.match(r'^v?[1-9]\d*\.0\.0$',release.get('tag','')))
        last_release=next((h.get('metrics',{}).get(p['name'].lower(),{}).get('release') for h in reversed(history) if p['name'].lower() in h.get('shown',[])),None)
        major=is_major and published and now-dt.timedelta(days=7)<=published<=now and release.get('tag')!=last_release
        p['label']='重大更新' if major else '持续热门' if prior else '今日新上榜'
        p['shownDays7']=len(prior)
        growth=p['growth'];rate=(growth['count']*24/growth['hours']) if growth else 0
        # Cumulative stars never enter the score. Repeats need fresh momentum.
        score=math.log1p(rate)*3+math.log1p(p.get('activeThreads') or 0)*2+(3 if major else 0)
        if prior and not major:score*=0.35
        p['score']=round(score,3)
    # A repo without measurable momentum stays out; never fill with old star leaders.
    eligible=[p for p in candidates if (p['growth'] and p['growth']['count']>0) or (p.get('activeThreads') or 0)>0 or p['label']=='重大更新']
    items=sorted(eligible,key=lambda p:(-p['score'],p['name'].lower()))[:6]
    metrics={p['name'].lower():{'stars':p['stars'],'release':(p.get('release') or {}).get('tag')} for p in candidates}
    history.append({'date':today,'collectedAt':now.isoformat(),'shown':[p['name'].lower() for p in items],'metrics':metrics})
    return items,history

def collect(previous,fetch_json,now=None):
    now=now or dt.datetime.now(ZONE);stamp=now.isoformat();errors=[];pool={};daily={};deadline=time.monotonic()+240
    try:daily=trending()
    except Exception:errors.append('GitHub Trending 读取失败')
    since=(now-dt.timedelta(days=7)).date().isoformat()
    # Recent AI candidates, ordered by update time. Not by all-time stars.
    for topic in ['artificial-intelligence','llm']:
        try:
            q=f'topic:{topic} pushed:>={since} archived:false fork:false'
            data=fetch_json('https://api.github.com/search/repositories?'+urllib.parse.urlencode(dict(q=q,sort='updated',per_page=8)))
            if data.get('incomplete_results'):errors.append('AI 候选搜索不完整')
            for r in data['items']:pool[r['full_name'].lower()]=r
        except Exception:errors.append('AI 候选搜索失败：'+topic)
    # Retain previous candidates for growth comparisons even if no longer in search results.
    names=list(dict.fromkeys([*daily,*[i['name'].lower() for i in previous.get('items',[])],*pool]))[:36]
    candidates=[]
    for name in names:
        if time.monotonic()>deadline:
            errors.append('采集达到时间上限，候选数据不完整');break
        try:
            r=pool.get(name) or fetch_json('https://api.github.com/repos/'+name)
            text=' '.join([r['full_name'],r.get('description') or '',*r.get('topics',[])])
            if r.get('private') or r.get('archived') or r.get('fork') or not AI.search(text):continue
            if not re.fullmatch(r'[\w.-]+/[\w.-]+',r['full_name']):continue
            p=dict(name=r['full_name'],url='https://github.com/'+r['full_name'],description=r.get('description') or '请查看原仓库说明。',stars=r['stargazers_count'],dailyStars=daily.get(name),activeThreads=None,discussionURL='https://github.com/'+r['full_name']+'/issues',release=None)
            candidates.append(p)
            # Keep search API calls bounded below the authenticated 30/min limit.
            if len(candidates)>=12:break
        except Exception:errors.append('仓库详情读取失败：'+name)
    for p in candidates:
        if time.monotonic()>deadline:
            errors.append('采集达到时间上限，部分热度指标未采集');break
        try:
            q=f'repo:{p["name"]} updated:>={since} comments:>0'
            data=fetch_json('https://api.github.com/search/issues?'+urllib.parse.urlencode(dict(q=q,per_page=1)))
            if data.get('incomplete_results'):raise ValueError('Incomplete discussions')
            p['activeThreads']=data['total_count'];p['discussionURL']='https://github.com/'+p['name']+'/issues?q='+urllib.parse.quote('updated:>='+since+' comments:>0')
        except Exception:errors.append('讨论数据不可用：'+p['name'])
        try:
            release=fetch_json('https://api.github.com/repos/'+p['name']+'/releases/latest')
            if not release.get('draft') and not release.get('prerelease'):p['release']={'tag':release['tag_name'],'publishedAt':release['published_at'],'url':release['html_url']}
        except urllib.error.HTTPError as e:
            if e.code!=404:errors.append('版本数据不可用：'+p['name'])
        except Exception:errors.append('版本数据不可用：'+p['name'])
    if not candidates:
        return {**previous,'schemaVersion':1,'attemptedAt':stamp,'refreshError':True,'errors':errors or ['未取得有效 AI 候选'],'items':previous.get('items',[])},False
    items,history=rank(candidates,previous.get('history',[]),now)
    return dict(schemaVersion=1,generatedAt=stamp,attemptedAt=stamp,items=items,history=history,partial=bool(errors),errors=errors),True
