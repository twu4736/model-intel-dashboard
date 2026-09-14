"""后台采集任务管理：同一时刻只允许一个采集任务，避免并发 diff 产生重复事件。

POST /api/refresh 立即返回，前端通过 GET /api/refresh 轮询 status/stage/result。
"""
from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone
from typing import Callable, Optional

from ..db import get_conn

_status = "idle"  # idle | running | done | error
_stage = ""
_result: Optional[dict] = None
_error: Optional[str] = None
_started_at: Optional[str] = None
_finished_at: Optional[str] = None
_lock = threading.Lock()


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def snapshot() -> dict:
    with _lock:
        return {
            "status": _status,
            "stage": _stage,
            "result": _result,
            "error": _error,
            "started_at": _started_at,
            "finished_at": _finished_at,
        }


def start(ingest_fn: Callable[[sqlite3.Connection, Callable[[str], None]], dict]) -> dict:
    """启动采集线程。已在采集时返回 started=False（不视为错误，前端继续轮询即可）。"""
    global _status, _stage, _result, _error, _started_at, _finished_at
    with _lock:
        already_running = _status == "running"
        if not already_running:
            _status = "running"
            _stage = "准备采集…"
            _result = None
            _error = None
            _started_at = _iso_now()
            _finished_at = None
            threading.Thread(target=_run, args=(ingest_fn,), daemon=True).start()
    return {"started": not already_running, "job": snapshot()}


def _run(ingest_fn) -> None:
    global _status, _stage, _result, _error, _finished_at
    try:

        def report(stage: str) -> None:
            global _stage
            with _lock:
                _stage = stage

        with get_conn() as conn:
            result = ingest_fn(conn, report)
        with _lock:
            _result = result
            _status = "done"
            _finished_at = _iso_now()
    except Exception as e:
        with _lock:
            _status = "error"
            _error = str(e)
            _finished_at = _iso_now()
