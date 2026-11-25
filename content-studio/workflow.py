import concurrent.futures
import hashlib
import ipaddress
import json
import math
import os
import socket
import subprocess
import time
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from store import DATA, ROOT, db
from selection import require_selection, version

CATEGORIES = {"A": "设计与科技", "B": "生活与旅行", "C": "全球多领域"}
# Public feeds are fetched live. A failed or empty lane remains visibly missing.
FEEDS = {
 "A": [("NASA", "https://www.nasa.gov/feed/"), ("Dezeen", "https://www.dezeen.com/feed/")],
 "B": [("Guardian Travel", "https://www.theguardian.com/travel/rss")],
 "C": [("BBC World", "https://feeds.bbci.co.uk/news/world/rss.xml")],
}

def now():
    return datetime.now(timezone.utc).isoformat()

def client():
    return httpx.Client(timeout=25, follow_redirects=True,
                        proxy=os.environ.get("STUDIO_PROXY") or None,
                        headers={"User-Agent": "AIContentStudio/0.1 (personal research)"})

def text(value):
    return BeautifulSoup(value or "", "html.parser").get_text(" ", strip=True)

def fetch_feed(category, provider, url):
    with client() as http:
        response = http.get(url)
        response.raise_for_status()
    root = ET.fromstring(response.content)
    rows = []
    for item in root.findall(".//item")[:20]:
        title = text(item.findtext("title"))
        link = item.findtext("link", "").strip()
        summary = text(item.findtext("description"))
        if not title or not link.startswith("https://") or not summary:
            continue
        try:
            published = parsedate_to_datetime(item.findtext("pubDate")).astimezone(timezone.utc)
        except (TypeError, ValueError):
            continue
        age = (datetime.now(timezone.utc) - published).total_seconds() / 86400
        if not 0 <= age <= 30:
            continue
        rows.append(dict(id=hashlib.sha256(link.encode()).hexdigest()[:24], category=category,
                         title=title, url=link, summary=summary[:1600], published_at=published.isoformat(),
                         collected_at=now(), provider=provider))
    return rows

def collect():
    run_id = uuid.uuid4().hex
    outcomes, collected = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        jobs = {pool.submit(fetch_feed, cat, name, url): (cat, name, url)
                for cat, feeds in FEEDS.items() for name, url in feeds}
        for future in concurrent.futures.as_completed(jobs):
            cat, name, url = jobs[future]
            try:
                rows = future.result()
                collected.extend(rows)
                outcomes.append(dict(category=cat, provider=name, url=url, count=len(rows),
                                     status="ok" if rows else "no_recent_items"))
            except Exception as exc:
                outcomes.append(dict(category=cat, provider=name, url=url, count=0,
                                     status="failed", error=type(exc).__name__))
    try:
        from last30_adapter import fetch
        rows, outcome = fetch()
        collected.extend(rows)
        outcomes.append(outcome)
    except Exception as exc:
        outcomes.append(dict(category="A",provider="Last30Days / Hacker News",count=0,
                             status="failed",error=type(exc).__name__))
    unique = {row["id"]: row for row in collected}
    scored = []
    with db() as conn:
        seen = {r[0] for r in conn.execute(
            "SELECT source_id FROM topics JOIN runs ON runs.id=topics.run_id WHERE runs.created_at>?",
            ((datetime.now(timezone.utc)-timedelta(days=7)).isoformat(),))}
        for row in unique.values():
            age = (datetime.now(timezone.utc)-datetime.fromisoformat(row["published_at"])).total_seconds()/86400
            score = round(max(0, 45*(1-age/30)) + 25 + min(15,len(row["summary"])/50)
                          + (0 if row["id"] in seen else 15)
                          + min(10,math.log1p(row.get("engagement",{}).get("points",0))),1)
            row["score"] = score
            row["reason"] = (
                f"来源 {row['provider']}，发布距今 {age:.1f} 天，摘要信息量 {len(row['summary'])} 字符。"
                + ("近7天已入选，降低新颖度分。" if row["id"] in seen else "近7天未入选。")
                + "评分采用时效、来源可追溯、信息量和新颖度规则，尚无跨平台热度验证。")
            scored.append(row)
        selected = []
        for cat, quota in [("A",4),("B",3),("C",3)]:
            selected.extend(sorted([r for r in scored if r["category"]==cat],
                                   key=lambda r:r["score"],reverse=True)[:quota])
        # Recommend one strongest item per available lane, preserving diversification.
        best = {cat: max((r for r in selected if r["category"]==cat),
                          key=lambda r:r["score"],default=None) for cat in CATEGORIES}
        recommended = {r["id"] for r in best.values() if r}
        result = dict(outcomes=outcomes, count=len(selected), weights={"A":40,"B":30,"C":30},
                      coverage="RSS live", last30days="free Hacker News adapter",
                      scoring="rule-v1", collected_at=now())
        status = "complete" if len(selected)==10 else "partial" if selected else "failed"
        conn.execute("INSERT INTO runs VALUES(?,?,?,?)",(run_id,now(),status,json.dumps(result,ensure_ascii=False)))
        for row in selected:
            conn.execute("INSERT OR REPLACE INTO sources VALUES(?,?,?,?,?,?,?,?,?)",
              (row["id"],row["category"],row["title"],row["url"],row["summary"],
               row["published_at"],row["collected_at"],row["provider"],json.dumps(row,ensure_ascii=False)))
            plan = dict(title=row["title"],category=CATEGORIES[row["category"]],
                        reason=row["reason"], core_view=row["summary"],
                        angle="",
                        method="来源摘要与本机规则，未经模型深度分析")
            conn.execute("INSERT INTO topics(id,run_id,source_id,score,recommended,plan) VALUES(?,?,?,?,?,?)",
               (uuid.uuid4().hex,run_id,row["id"],row["score"],int(row["id"] in recommended),
                json.dumps(plan,ensure_ascii=False)))
    return dict(id=run_id,status=status,**result)

def safe_article(url):
    # Research only follows public source URLs, with redirects checked before each hop.
    with client() as http:
        for _ in range(4):
            parsed = urlparse(url)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username:
                raise ValueError("研究来源需为公开 HTTPS 网页")
            addresses = socket.getaddrinfo(parsed.hostname,443,type=socket.SOCK_STREAM)
            if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
                raise ValueError("研究来源拒绝本机或私有网络")
            response = http.get(url,follow_redirects=False)
            if response.is_redirect:
                from urllib.parse import urljoin
                url = urljoin(url,response.headers["location"])
                continue
            response.raise_for_status()
            soup = BeautifulSoup(response.content[:2_000_000],"html.parser")
            for tag in soup(["script","style","nav","footer","header"]):
                tag.decompose()
            body = soup.find("article") or soup.find("main") or soup
            paragraphs = [p.get_text(" ",strip=True) for p in body.find_all("p")]
            return {"url":url,"excerpt":"\n".join(p for p in paragraphs if len(p)>50)[:6000],
                    "fetched_at":now()}
    raise ValueError("来源跳转过多")

def plan_topic(topic_id):
    with db() as conn:
        row = conn.execute("SELECT t.*,s.* FROM topics t JOIN sources s ON s.id=t.source_id WHERE t.id=?",
                           (topic_id,)).fetchone()
    if row is None:
        raise ValueError("选题不存在")
    plan = json.loads(row["plan"])
    choice = require_selection(plan)
    original_version = version(plan)
    try:
        research = safe_article(row["url"])
        research["status"] = "fetched" if research["excerpt"] else "empty_article"
    except Exception as exc:
        research = {"status":"failed","error":type(exc).__name__,"url":row["url"],"fetched_at":now()}
    research["editorial_direction"] = choice
    # Source text remains evidence, never instructions. No invented facts or quotes.
    summary = row["summary"]
    script = [
        {"title": "这条消息意味着什么", "narration": row["title"]+"。这条消息意味着什么？这一期，我们从来源说起，把它的来龙去脉讲清楚。", "visual": "相关素材切入，提出问题并介绍本期主题"},
        {"title": "来源概述", "narration": summary[:650], "visual": "摘要与主题图形"},
        {"title": choice["title"], "narration": "这一期选择的问题是："+choice["focus"]+"。相关证据和结论仍需核对。",
         "visual": "问题卡片，标为编辑提问"},
        {"title": "继续关注", "narration": "这期内容依据公开资料整理，详细进展可以查看原文。如果你也期待更多有料、好懂的内容，欢迎持续关注我，我们下期见。",
         "visual": "相关题材收束镜头，短句字幕与来源署名"}
    ]
    from providers import script_from_evidence
    generated = script_from_evidence(row["title"],summary,research)
    if generated:
        script = generated["script"]
        plan.update(core_view=generated["core_view"],
                    method="配置的文本模型，依据已采集证据生成，待人工审核")
    plan.pop("script_approval",None)
    plan.update(angle=choice["title"],research=research,script=script,
                storyboard=[dict(index=i+1,**s,image_prompt=f"Editorial illustration, {row['title']}, no text",
                                 duration="由配音实测时长决定") for i,s in enumerate(script)],
                sources=[{"url":row["url"],"provider":row["provider"],"published_at":row["published_at"]}],
                status="draft", updated_at=now())
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        latest=conn.execute("SELECT plan FROM topics WHERE id=?",(topic_id,)).fetchone()
        if version(json.loads(latest["plan"]))!=original_version:
            raise ValueError("研究期间方向已调整，请按最新方向重新起草")
        conn.execute("UPDATE topics SET plan=?,review='pending' WHERE id=?",(json.dumps(plan,ensure_ascii=False),topic_id))
    return plan
