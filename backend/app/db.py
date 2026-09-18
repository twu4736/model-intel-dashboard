"""SQLite 连接与 schema。"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "intel.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS models (
    id                        TEXT PRIMARY KEY,
    name                      TEXT NOT NULL,
    provider                  TEXT,
    context_length            INTEGER,
    modalities                TEXT,
    supports_vision           INTEGER DEFAULT 0,
    supports_function_calling INTEGER DEFAULT 0,
    supports_reasoning        INTEGER DEFAULT 0,
    open_source               INTEGER,            -- 1/0/NULL
    release_date              TEXT,
    description               TEXT,
    source                    TEXT,
    category                  TEXT,               -- llm/multimodal/image/audio
    hf_downloads              INTEGER,            -- HF 30 天下载量（热度代理）
    hf_likes                  INTEGER,            -- HF 点赞数
    hugging_face_id           TEXT,
    updated_at                TEXT
);

CREATE TABLE IF NOT EXISTS prices (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id              TEXT NOT NULL,
    input_per_mtok        REAL,
    output_per_mtok       REAL,
    cache_read_per_mtok   REAL,
    fetched_at            TEXT NOT NULL,
    FOREIGN KEY (model_id) REFERENCES models(id)
);
CREATE INDEX IF NOT EXISTS idx_prices_model ON prices(model_id, id);

CREATE TABLE IF NOT EXISTS events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    type          TEXT NOT NULL,      -- new_model | price_change | seed | deprecation
    model_id      TEXT,
    title         TEXT NOT NULL,
    before_value  TEXT,
    after_value   TEXT,
    published_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(published_at DESC, id DESC);
"""


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        # 兼容已有库：尝试为老库补上新增的列（重复添加会抛 OperationalError，吞掉）
        try:
            conn.execute("ALTER TABLE models ADD COLUMN category TEXT")
        except sqlite3.OperationalError:
            pass  # 列已存在


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
