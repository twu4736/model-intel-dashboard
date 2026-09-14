"""FastAPI 入口：初始化 DB、空库时后台播种、挂载 API、托管前端构建产物。"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .db import get_conn, init_db
from .routers import api
from .services import jobs
from .services.ingest import ingest

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with get_conn() as conn:
        n = conn.execute("SELECT COUNT(*) AS c FROM models").fetchone()["c"]
    if n == 0:
        # 空库 → 后台任务初始导入，不阻塞服务启动（此前同步导入要 40s+ 连接被拒）
        result = jobs.start(ingest)
        print(f"[startup] 空库，后台初始导入已启动：started={result['started']}")
    yield


app = FastAPI(title="Global Model Intelligence", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # 生产模式前后端同源托管，无需跨域；这里只放行 vite dev server
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api.router)


@app.get("/favicon.ico")
def favicon():
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        '<text y=".9em" font-size="90">📡</text></svg>'
    )
    return Response(content=svg, media_type="image/svg+xml")


# 托管前端构建产物（生产模式）。开发模式下用 vite dev server，走代理。
if FRONTEND_DIST.exists() and (FRONTEND_DIST / "index.html").exists():
    assets = FRONTEND_DIST / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        # API 前缀未命中已注册路由时返回 404 JSON，不能被 SPA 兜底吞成 200 HTML
        if full_path == "api" or full_path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        return FileResponse(FRONTEND_DIST / "index.html")
