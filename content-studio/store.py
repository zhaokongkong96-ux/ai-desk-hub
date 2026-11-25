import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get("STUDIO_DATA", str(ROOT / "data")))
DATA.mkdir(parents=True, exist_ok=True)
os.chmod(DATA, 0o700)

@contextmanager
def db():
    conn = sqlite3.connect(DATA / "studio.sqlite", timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

def initialize():
    with db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS sources(
          id TEXT PRIMARY KEY, category TEXT NOT NULL, title TEXT NOT NULL,
          url TEXT NOT NULL, summary TEXT NOT NULL, published_at TEXT,
          collected_at TEXT NOT NULL, provider TEXT NOT NULL, raw TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS runs(
          id TEXT PRIMARY KEY, created_at TEXT NOT NULL, status TEXT NOT NULL,
          result TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS topics(
          id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
          source_id TEXT NOT NULL REFERENCES sources(id), score REAL NOT NULL,
          recommended INTEGER NOT NULL, plan TEXT NOT NULL,
          review TEXT NOT NULL DEFAULT 'pending');
        CREATE TABLE IF NOT EXISTS jobs(
          id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id),
          status TEXT NOT NULL, stage TEXT NOT NULL, error TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, result TEXT);
        """)
        # A process exit cannot leave a job falsely marked as running.
        conn.execute("UPDATE jobs SET status='failed', error='后台重启，任务已中断，可重试' WHERE status IN ('queued','running')")

def topics():
    with db() as conn:
        rows = conn.execute("""
        SELECT t.*,s.title,s.category,s.url,s.summary,s.provider,s.published_at,s.collected_at,
        r.created_at AS run_time FROM topics t JOIN sources s ON t.source_id=s.id
        JOIN runs r ON r.id=t.run_id ORDER BY r.created_at DESC,t.recommended DESC,t.score DESC
        LIMIT 100""").fetchall()
    return [dict(row, plan=json.loads(row["plan"])) for row in rows]
