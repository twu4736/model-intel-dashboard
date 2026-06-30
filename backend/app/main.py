"""FastAPI 入口：初始化 DB、启动时按需播种、挂载 API、托管前端构建产物。"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .db import get_conn, init_db
from .routers import api
from .services.ingest import ingest

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with get_conn() as conn:
        n = conn.execute("SELECT COUNT(*) AS c FROM models").fetchone()["c"]
        if n == 0:
            try:
                result = ingest(conn)
                print(f"[startup] 初始导入完成：{result}")
            except Exception as e:  # 启动时网络失败不应阻止服务起来
                print("[startup] 初始导入失败（可稍后点「立即采集」重试）：", e)
    yield


app = FastAPI(title="Global Model Intelligence", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api.router)

# 托管前端构建产物（生产模式）。开发模式下用 vite dev server，走代理。
if FRONTEND_DIST.exists() and (FRONTEND_DIST / "index.html").exists():
    assets = FRONTEND_DIST / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        return FileResponse(FRONTEND_DIST / "index.html")
