"""Collect public headline RSS only; no accounts, article bodies or invented trends."""
import argparse, concurrent.futures, datetime as dt, email.utils, hashlib, json, re, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path
ZONE=dt.timezone(dt.timedelta(hours=8))
CATEGORIES=['社会观察','职场成长','科技生活','文化知识']
def google(query=None):
    base='https://news.google.com/rss'
    if query:base+='/search?'+urllib.parse.urlencode({'q':query+' when:1d'})+'&'
    else:base+='?'
    return base+'hl=zh-CN&gl=CN&ceid=CN:zh-Hans'
SOURCES=[
    ('google-social','Google 新闻 · 综合',google(),'社会观察'),
    ('google-career','Google 新闻 · 职场',google('职场 OR 就业 OR 工作方式 OR 个人成长'),'职场成长'),
    ('google-culture','Google 新闻 · 文化',google('文化 OR 阅读 OR 历史 OR 科普'),'文化知识'),
    ('sspai','少数派','https://sspai.com/feed','科技生活'),
    ('ithome','IT之家','https://www.ithome.com/rss/','科技生活')]
def safe_url(value):
    try:
        u=urllib.parse.urlsplit(value.strip())
        return value.strip() if u.scheme=='https' and u.hostname and not u.username and not u.password else ''
    except ValueError:return ''
def read_source(spec,now):
    key,name,url,category=spec
    status=dict(id=key,name=name,url=url,ok=False,count=0)
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'AI-Desk-Hub/0.7 RSS headline reader','Accept':'application/rss+xml, application/xml, text/xml'})
        with urllib.request.urlopen(req,timeout=8) as response:raw=response.read(2_000_001)
        if len(raw)>2_000_000:raise ValueError('feed size')
        root=ET.fromstring(raw);nodes=root.findall('.//item')
        if not nodes:raise ValueError('empty feed')
        found=[]
        for node in nodes[:80]:
            title=re.sub(r'\s+',' ',node.findtext('title') or '').strip()[:240]
            link=safe_url(node.findtext('link') or '')
            try:published=email.utils.parsedate_to_datetime(node.findtext('pubDate') or '').astimezone(ZONE)
            except (ValueError,TypeError,AttributeError):continue
            if category=='文化知识' and re.search(r'金球奖|足球|篮球|欧冠|英超|球员|球队',title):continue
            if not title or not link or published>now+dt.timedelta(minutes=5) or published<now-dt.timedelta(days=7):continue
            publisher=node.find('source');source=(publisher.text or '').strip() if publisher is not None else name
            if source and title.endswith(' - '+source):title=title[:-len(' - '+source)]
            found.append(dict(id=hashlib.sha256(link.encode()).hexdigest()[:20],title=title,url=link,source=source[:100],feed=name,category=category,publishedAt=published.isoformat(),date=published.date().isoformat()))
        status.update(ok=True,count=len(found));return found,status
    except Exception:status['error']='暂未获取到有效内容';return [],status

def collect():
    now=dt.datetime.now(ZONE);items=[];sources=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(SOURCES)) as pool:
        for found,status in pool.map(lambda s:read_source(s,now),SOURCES):items.extend(found);sources.append(status)
    seen=set();selected=[]
    # Bound each category so a fast technology feed does not crowd out the rest.
    for category in CATEGORIES:
        group=sorted((i for i in items if i['category']==category),key=lambda i:i['publishedAt'],reverse=True);count=0;per_source={}
        for item in group:
            norm=re.sub(r'[\W_]+','',item['title']).lower()
            if norm in seen or per_source.get(item['feed'],0)>=8:continue
            seen.add(norm);selected.append(item);per_source[item['feed']]=per_source.get(item['feed'],0)+1;count+=1
            if count>=12:break
    return dict(schemaVersion=1,generatedAt=now.isoformat(),date=now.date().isoformat(),timezone='Asia/Shanghai',sources=sources,items=selected,ranking='媒体报道线索；不代表全网热搜排名')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output');args=p.parse_args();data=collect();raw=json.dumps(data,ensure_ascii=False,indent=2)+'\n'
    if args.output:
        target=Path(args.output);temp=target.with_suffix('.tmp');temp.write_text(raw);temp.replace(target)
        print(json.dumps({'date':data['date'],'items':len(data['items']),'sources':data['sources']},ensure_ascii=False))
    else:print(raw,end='')
