import concurrent.futures
import hmac
import json
import os
import secrets
import threading
import uuid
from pathlib import Path
from typing import Literal
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Depends, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, Field
from store import DATA, ROOT, db, initialize, topics
from workflow import collect, plan_topic, now
from media import produce
from selection import proposals, version, script_version, require_selection, invalidate_script

initialize()
with db() as conn:
    columns={row[1] for row in conn.execute("PRAGMA table_info(jobs)")}
    if "review" not in columns:
        conn.execute("ALTER TABLE jobs ADD COLUMN review TEXT NOT NULL DEFAULT 'pending'")
        conn.execute("ALTER TABLE jobs ADD COLUMN review_note TEXT NOT NULL DEFAULT ''")
    if "snapshot" not in columns:
        conn.execute("ALTER TABLE jobs ADD COLUMN snapshot TEXT")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS one_active_job ON jobs(topic_id) WHERE status IN ('queued','running')")
token_path=DATA/"access-token"
if not token_path.exists():
    token_path.write_text(secrets.token_urlsafe(32))
    token_path.chmod(0o600)
TOKEN=token_path.read_text().strip()
app=FastAPI(title="AI Content Studio",version="0.1.0")
origins=os.environ.get("STUDIO_ORIGINS","https://zhaokongkong96-ux.github.io,http://localhost:8775,http://localhost:8876,http://127.0.0.1:8876").split(",")
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_methods=["GET","POST","PUT"],
                   allow_headers=["Authorization","Content-Type"])
pool=concurrent.futures.ThreadPoolExecutor(max_workers=1)
collect_lock=threading.Lock()

def auth(authorization: str = Header(default="")):
    if not hmac.compare_digest(authorization,"Bearer "+TOKEN):
        raise HTTPException(401,"需要此 Mac 的访问令牌")

@app.get("/health")
def health():
    return {"ok":True,"version":"0.1.0","requires_auth":True}

@app.get("/")
@app.get("/content-studio.html")
def page():
    return FileResponse((ROOT/"web" if (ROOT/"web").exists() else ROOT.parent)/"content-studio.html")

@app.get("/index.html")
def hub():
    return RedirectResponse("https://zhaokongkong96-ux.github.io/ai-desk-hub/")

@app.get("/studio-preview.json")
def preview_data():
    return FileResponse((ROOT/"web" if (ROOT/"web").exists() else ROOT.parent)/"studio-preview.json")

@app.get("/studio-transport.js")
def transport_script():
    return FileResponse((ROOT/"web" if (ROOT/"web").exists() else ROOT.parent)/"studio-transport.js",media_type="application/javascript")

@app.get("/studio-config.json")
def studio_config():
    return FileResponse((ROOT/"web" if (ROOT/"web").exists() else ROOT.parent)/"studio-config.json")

@app.get("/studio.js")
def script():
    return FileResponse((ROOT/"web" if (ROOT/"web").exists() else ROOT.parent)/"studio.js",media_type="application/javascript")

@app.get("/api/topics",dependencies=[Depends(auth)])
def get_topics():
    rows=topics()
    for row in rows:
        row["options"]=proposals(row)
        row["plan_version"]=version(row["plan"])
    return rows

@app.get("/api/runs",dependencies=[Depends(auth)])
def runs():
    with db() as conn:
        return [dict(row,result=json.loads(row["result"])) for row in
                conn.execute("SELECT * FROM runs ORDER BY created_at DESC LIMIT 20")]

def collect_once():
    if not collect_lock.acquire(blocking=False):
        raise ValueError("已有采集任务运行中")
    try:
        return collect()
    finally:
        collect_lock.release()

@app.post("/api/collect",dependencies=[Depends(auth)])
def collect_api():
    try:
        return collect_once()
    except ValueError as exc:
        raise HTTPException(409,str(exc))

class Direction(BaseModel):
    angle_id: str = Field(max_length=20)
    custom_title: str = Field(default="",max_length=200)
    custom_focus: str = Field(default="",max_length=2000)
    note: str = Field(default="",max_length=3000)
    confirmed: bool = False
    expected_version: str

@app.put("/api/topics/{topic_id}/selection",dependencies=[Depends(auth)])
def select_direction(topic_id: str, body: Direction):
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row=conn.execute("SELECT t.plan,s.url,s.title,s.summary FROM topics t JOIN sources s ON t.source_id=s.id WHERE t.id=?",(topic_id,)).fetchone()
        if not row:
            raise HTTPException(404,"选题不存在")
        plan=json.loads(row["plan"])
        if version(plan)!=body.expected_version:
            raise HTTPException(409,"另一处已修改，请刷新后核对")
        if conn.execute("SELECT 1 FROM jobs WHERE topic_id=? AND status IN ('queued','running')",(topic_id,)).fetchone():
            raise HTTPException(409,"此选题正在制作，完成后再调整方向")
        if body.angle_id=="custom":
            if not body.custom_title.strip() or not body.custom_focus.strip():
                raise HTTPException(422,"请填写自定角度和希望讨论的问题")
            choice={"id":"custom","title":body.custom_title.strip(),"focus":body.custom_focus.strip()}
        else:
            choice=next((a for a in proposals(row)["angles"] if a["id"]==body.angle_id),None)
            if not choice:
                raise HTTPException(422,"请选择一个候选角度或填写自己的方向")
        invalidate_script(plan)
        plan["selection"]={**choice,"note":body.note,"confirmed_at":now() if body.confirmed else None}
        plan["angle"]=choice["title"]
        plan["updated_at"]=now()
        plan.setdefault("discussion",[]).append({"at":now(),"note":body.note,"angle":choice["title"],
                                                "action":"confirmed" if body.confirmed else "discussion"})
        conn.execute("UPDATE topics SET plan=?,review='pending' WHERE id=?",(json.dumps(plan,ensure_ascii=False),topic_id))
    return {"plan":plan,"plan_version":version(plan)}

@app.post("/api/topics/{topic_id}/plan",dependencies=[Depends(auth)])
def plan_api(topic_id: str):
    try:
        return plan_topic(topic_id)
    except ValueError as exc:
        raise HTTPException(409,str(exc))

class Review(BaseModel):
    status: Literal["pending","approved","rejected"]
    note: str = Field(default="",max_length=2000)

@app.put("/api/topics/{topic_id}/review",dependencies=[Depends(auth)])
def review(topic_id: str, body: Review):
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row=conn.execute("SELECT plan FROM topics WHERE id=?",(topic_id,)).fetchone()
        if not row:
            raise HTTPException(404,"选题不存在")
        plan=json.loads(row["plan"])
        plan["review_note"]=body.note
        plan["reviewed_at"]=now()
        conn.execute("UPDATE topics SET review=?,plan=? WHERE id=?",
                     (body.status,json.dumps(plan,ensure_ascii=False),topic_id))
    return {"status":body.status}

class EditPlan(BaseModel):
    script: list[dict] = Field(min_length=1,max_length=12)
    expected_version: str

@app.put("/api/topics/{topic_id}/script",dependencies=[Depends(auth)])
def edit(topic_id: str, body: EditPlan):
    scenes=[]
    for i,scene in enumerate(body.script):
        title,narration=str(scene.get("title","")),str(scene.get("narration",""))
        if not title.strip() or not narration.strip() or len(narration)>1800 or len(title)>160:
            raise HTTPException(422,"每镜需有标题和口播，口播最多1800字")
        scenes.append(dict(index=i+1,title=title,narration=narration,
                           visual=str(scene.get("visual","主题图形")),
                           image_prompt=str(scene.get("image_prompt",title))))
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row=conn.execute("SELECT plan FROM topics WHERE id=?",(topic_id,)).fetchone()
        if not row:
            raise HTTPException(404,"选题不存在")
        plan=json.loads(row["plan"])
        if version(plan)!=body.expected_version:
            raise HTTPException(409,"脚本已在另一处修改，请刷新核对")
        try:
            require_selection(plan)
        except ValueError as exc:
            raise HTTPException(409,str(exc))
        plan.pop("script_approval",None)
        plan.update(script=scenes,storyboard=scenes,updated_at=now())
        conn.execute("UPDATE topics SET plan=?,review='pending' WHERE id=?",(json.dumps(plan,ensure_ascii=False),topic_id))
    return plan

class ScriptApproval(BaseModel):
    expected_version: str

@app.post("/api/topics/{topic_id}/approve-script",dependencies=[Depends(auth)])
def approve_script(topic_id: str, body: ScriptApproval):
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row=conn.execute("SELECT plan FROM topics WHERE id=?",(topic_id,)).fetchone()
        if not row:
            raise HTTPException(404,"选题不存在")
        plan=json.loads(row["plan"])
        if version(plan)!=body.expected_version:
            raise HTTPException(409,"脚本已更新，请重新核对")
        try:
            require_selection(plan)
        except ValueError as exc:
            raise HTTPException(409,str(exc))
        if not plan.get("script") or not plan.get("storyboard"):
            raise HTTPException(409,"请先完成脚本和分镜")
        plan["script_approval"]={"digest":script_version(plan),"at":now()}
        conn.execute("UPDATE topics SET plan=?,review='approved' WHERE id=?",(json.dumps(plan,ensure_ascii=False),topic_id))
    return {"plan":plan,"plan_version":version(plan)}

def progress(job_id,stage):
    with db() as conn:
        conn.execute("UPDATE jobs SET stage=?,updated_at=? WHERE id=?",(stage,now(),job_id))

def production(job_id,topic_id):
    try:
        with db() as conn:
            conn.execute("UPDATE jobs SET status='running',updated_at=? WHERE id=?",(now(),job_id))
            row=conn.execute("SELECT t.plan,s.category,j.snapshot FROM topics t JOIN sources s ON t.source_id=s.id JOIN jobs j ON j.topic_id=t.id WHERE j.id=?",(job_id,)).fetchone()
        plan=json.loads(row["snapshot"] or row["plan"])
        if not plan.get("storyboard"):
            plan=plan_topic(topic_id)
        result=produce(job_id,plan,row["category"],lambda stage:progress(job_id,stage))
        with db() as conn:
            conn.execute("UPDATE jobs SET status='complete',stage='等待审核',result=?,updated_at=? WHERE id=?",
                         (json.dumps(result,ensure_ascii=False),now(),job_id))
    except Exception as exc:
        # Do not persist HTTP headers, provider response bodies or credentials.
        with db() as conn:
            conn.execute("UPDATE jobs SET status='failed',stage='生产失败',error=?,updated_at=? WHERE id=?",
                         (type(exc).__name__,now(),job_id))

@app.post("/api/topics/{topic_id}/produce",dependencies=[Depends(auth)])
def produce_api(topic_id: str):
    job_id=uuid.uuid4().hex
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        if not conn.execute("SELECT 1 FROM topics WHERE id=?",(topic_id,)).fetchone():
            raise HTTPException(404,"选题不存在")
        existing=conn.execute("SELECT id,snapshot FROM jobs WHERE topic_id=? AND status IN ('queued','running')",(topic_id,)).fetchone()
        plan=json.loads(conn.execute("SELECT plan FROM topics WHERE id=?",(topic_id,)).fetchone()["plan"])
        try:
            require_selection(plan)
        except ValueError as exc:
            raise HTTPException(409,str(exc))
        if not plan.get("storyboard") or plan.get("script_approval",{}).get("digest")!=script_version(plan):
            raise HTTPException(409,"请先逐镜核对并确认当前脚本，再开始制作")
        if existing:
            if script_version(json.loads(existing["snapshot"] or "{}"))==script_version(plan):
                return {"id":existing["id"]}
            raise HTTPException(409,"上一版正在制作，请等完成后再提交新版本")
        conn.execute("INSERT INTO jobs(id,topic_id,status,stage,error,created_at,updated_at,result,snapshot) VALUES(?,?,?,?,?,?,?,?,?)",
                     (job_id,topic_id,"queued","排队",None,now(),now(),None,json.dumps(plan,ensure_ascii=False)))
    pool.submit(production,job_id,topic_id)
    return {"id":job_id}

@app.put("/api/jobs/{job_id}/review",dependencies=[Depends(auth)])
def review_job(job_id: str, body: Review):
    with db() as conn:
        row=conn.execute("SELECT status FROM jobs WHERE id=?",(job_id,)).fetchone()
        if not row:
            raise HTTPException(404,"视频任务不存在")
        if row["status"]!="complete":
            raise HTTPException(409,"视频生成完成后才能审核")
        conn.execute("UPDATE jobs SET review=?,review_note=?,updated_at=? WHERE id=?",
                     (body.status,body.note,now(),job_id))
    return {"status":body.status}

@app.get("/api/jobs",dependencies=[Depends(auth)])
def jobs():
    with db() as conn:
        return [dict(row,result=json.loads(row["result"]) if row["result"] else None)
                for row in conn.execute("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50")]

@app.get("/api/media/{job_id}/{name}",dependencies=[Depends(auth)])
def media(job_id: str,name: str):
    if not (len(job_id)==32 and all(c in "0123456789abcdef" for c in job_id)):
        raise HTTPException(404)
    if name not in {"video.mp4","captions.srt","plan.json","media-sources.json"}:
        raise HTTPException(404)
    with db() as conn:
        job=conn.execute("SELECT status FROM jobs WHERE id=?",(job_id,)).fetchone()
    if not job:
        raise HTTPException(404)
    if job["status"]!="complete":
        raise HTTPException(409,"视频尚未生成完成")
    path=DATA/job_id/name
    if not path.is_file():
        raise HTTPException(404)
    return FileResponse(path)

def scheduler():
    import time
    while True:
        current=datetime.now(ZoneInfo("Asia/Shanghai"))
        day=current.date().isoformat()
        marker=DATA/"last-scheduled-day"
        if os.environ.get("STUDIO_SCHEDULE")=="true" and current.hour>=8 and (
            not marker.exists() or marker.read_text()!=day):
            try:
                result=collect_once()
                if result["count"]:
                    marker.write_text(day)
            except Exception:
                pass
            time.sleep(300)
        else:
            time.sleep(30)

@app.on_event("startup")
def startup():
    threading.Thread(target=scheduler,daemon=True).start()
    from remote_bridge import start
    start()
