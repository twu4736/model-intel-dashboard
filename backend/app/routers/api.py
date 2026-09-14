"""API 路由。"""
from __future__ import annotations

from fastapi import APIRouter, Query

from ..db import get_conn
from ..services import jobs
from ..services.ingest import ingest

router = APIRouter()

_SORT_FIELDS = {
    "name", "provider", "context_length",
    "input_per_mtok", "output_per_mtok", "release_date",
    "hf_downloads", "hf_likes",
}
_SORT_PATTERN = "|".join(sorted(_SORT_FIELDS))
_NOCASE_FIELDS = {"name", "provider"}  # 文本列忽略大小写排序


def _order_sql(sort: str, order: str) -> str:
    col = f"{sort} COLLATE NOCASE" if sort in _NOCASE_FIELDS else sort
    direction = "DESC" if order == "desc" else "ASC"
    # NULLS LAST + id 兜底键：保证排序稳定（否则全 NULL 列会得到随机顺序）
    return f"{col} {direction} NULLS LAST, m.id ASC"


def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/api/models")
def list_models(
    search: str | None = Query(None),
    provider: str | None = Query(None),
    vision: bool | None = Query(None),
    sort: str = Query("release_date", pattern=f"^({_SORT_PATTERN})$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    where: list[str] = []
    params: list = []
    if search:
        esc = _escape_like(search)
        where.append("(m.id LIKE ? ESCAPE '\\' OR m.name LIKE ? ESCAPE '\\')")
        params += [f"%{esc}%", f"%{esc}%"]
    if provider:
        where.append("m.provider = ?")
        params.append(provider)
    if vision:
        where.append("m.supports_vision = 1")
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    order_sql = _order_sql(sort, order)

    sql = f"""
        SELECT m.id, m.name, m.provider, m.context_length, m.modalities,
               m.supports_vision, m.supports_function_calling, m.supports_reasoning,
               m.open_source, m.release_date, m.description,
               p.input_per_mtok, p.output_per_mtok, p.cache_read_per_mtok,
               m.hf_downloads, m.hf_likes
        FROM models m
        LEFT JOIN prices p
          ON p.model_id = m.id
         AND p.id = (SELECT MAX(id) FROM prices WHERE model_id = m.id)
        {where_sql}
        ORDER BY {order_sql}
        LIMIT ? OFFSET ?
    """
    with get_conn() as conn:
        rows = [dict(r) for r in conn.execute(sql, params + [limit, offset])]
        total = conn.execute(
            f"SELECT COUNT(*) AS c FROM models m {where_sql}", params
        ).fetchone()["c"]
        providers = [
            r["provider"]
            for r in conn.execute(
                "SELECT DISTINCT provider FROM models WHERE provider IS NOT NULL ORDER BY provider"
            )
        ]
    return {"items": rows, "total": total, "providers": providers}


@router.get("/api/events")
def list_events(limit: int = Query(50, ge=1, le=500)):
    with get_conn() as conn:
        rows = [
            dict(r)
            for r in conn.execute(
                "SELECT id, type, model_id, title, before_value, after_value, published_at "
                "FROM events ORDER BY published_at DESC, id DESC LIMIT ?",
                (limit,),
            )
        ]
        total = conn.execute("SELECT COUNT(*) AS c FROM events").fetchone()["c"]
    return {"items": rows, "total": total}


@router.post("/api/refresh")
def refresh():
    """启动后台采集，立即返回。进度与结果通过 GET /api/refresh 轮询。"""
    return jobs.start(ingest)


@router.get("/api/refresh")
def refresh_status():
    return jobs.snapshot()
