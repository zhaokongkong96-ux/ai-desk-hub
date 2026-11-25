"""Project-scoped, free-only Last30Days subprocess integration."""
import hashlib
import json
import os
import subprocess
from pathlib import Path
from store import DATA, ROOT
from workflow import now

def fetch():
    tool=ROOT/".tools/last30days/skills/last30days/scripts/last30days.py"
    python=os.environ.get("LAST30DAYS_PYTHON")
    if not python:
        python=subprocess.check_output([str(ROOT/".venv/bin/uv"),"python","find","3.12"],text=True).strip()
    env=dict(os.environ, LAST30DAYS_MEMORY_DIR="", FROM_BROWSER="off",
             BROWSER_CONSENT="false", LAST30DAYS_API_KEY="",LAST30DAYS_API_BASE="",
             INCLUDE_SOURCES="hackernews")
    proxy=env.get("STUDIO_PROXY")
    if proxy:
        env.update(HTTPS_PROXY=proxy,HTTP_PROXY=proxy)
    command=[python,str(tool),"design technology","--search","hackernews","--quick",
             "--emit=json","--json-profile","raw","--auto-resolve"]
    process=subprocess.run(command,env=env,text=True,capture_output=True,timeout=180)
    if process.returncode:
        raise RuntimeError("Last30Days failed, exit "+str(process.returncode))
    report=json.loads(process.stdout)
    stamp=now()
    (DATA/"last30days-latest.json").write_text(json.dumps(report,ensure_ascii=False))
    rows=[]
    for item in report.get("items_by_source",{}).get("hackernews",[]):
        url=item.get("url","")
        if not url.startswith("https://") or not item.get("published_at"):
            continue
        # Comments are engagement evidence, never substituted for an article summary.
        rows.append(dict(id=hashlib.sha256(url.encode()).hexdigest()[:24],category="A",
          title=item["title"],url=url,
          summary="Hacker News 讨论线索。"+item["title"]+"。原文内容待正文取证核实。",
          published_at=item["published_at"]+"T00:00:00+00:00" if len(item["published_at"])==10 else item["published_at"],
          collected_at=stamp,provider="Last30Days / Hacker News",
          engagement=item.get("engagement",{})))
    status=report.get("source_status",{}).get("hackernews",{}).get("state","unknown")
    return rows,dict(category="A",provider="Last30Days / Hacker News",
                     url="https://news.ycombinator.com/",count=len(rows),status=status)
