"""API 路由。"""
from __future__ import annotations

from fastapi import APIRouter, Query

from ..db import get_conn
from ..model import CATEGORY_AUDIO, CATEGORY_IMAGE, CATEGORY_LLM, CATEGORY_MULTIMODAL
from ..services import jobs
from ..services.ingest import ingest

router = APIRouter()

_SORT_FIELDS = {
    "name", "provider", "context_length",
    "input_per_mtok", "output_per_mtok", "release_date",
    "heat",
}
_SORT_PATTERN = "|".join(sorted(_SORT_FIELDS))
_NOCASE_FIELDS = {"name", "provider"}  # 文本列忽略大小写排序

# 分类白名单（前后端共享同一份字面量）
_CATEGORIES = {CATEGORY_LLM, CATEGORY_MULTIMODAL, CATEGORY_IMAGE, CATEGORY_AUDIO}
_CATEGORY_PATTERN = "|".join(sorted(_CATEGORIES))


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
    reasoning: bool | None = Query(None),
    function_calling: bool | None = Query(None),
    open_source: bool | None = Query(None),
    category: str = Query(CATEGORY_LLM, pattern=f"^({_CATEGORY_PATTERN})$"),
    sort: str = Query("release_date", pattern=f"^({_SORT_PATTERN})$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    where: list[str] = ["m.category = ?"]
    params: list = [category]
    if search:
        esc = _escape_like(search)
        where.append("(m.id LIKE ? ESCAPE '\\' OR m.name LIKE ? ESCAPE '\\')")
        params += [f"%{esc}%", f"%{esc}%"]
    if provider:
        where.append("m.provider = ?")
        params.append(provider)
    if vision:
        where.append("m.supports_vision = 1")
    if reasoning:
        where.append("m.supports_reasoning = 1")
    if function_calling:
        where.append("m.supports_function_calling = 1")
    if open_source:
        where.append("m.open_source = 1")
    where_sql = "WHERE " + " AND ".join(where)
    order_sql = _order_sql(sort, order)

    # 热度 = 三轴组合：开源 + log10(1+ctx) + 多模态
    # HF 数据可达时叠加真实 log10(下载)+log10(点赞)；不可达时回退代理公式
    # 必须在 SQL 里就算好（不能 Python 后处理再排序），否则 ORDER BY 拿到的是错误值
    heat_expr = (
        "(CASE WHEN m.hf_downloads IS NOT NULL OR m.hf_likes IS NOT NULL "
        "  THEN LOG10(1 + COALESCE(m.hf_downloads, 0)) * 2 "
        "       + LOG10(1 + COALESCE(m.hf_likes, 0)) "
        "  ELSE 0 END) "
        "+ (CASE WHEN m.open_source = 1 THEN 3.0 ELSE 0.0 END) "
        "+ LOG10(1 + COALESCE(m.context_length, 0)) "
        "+ (CASE WHEN m.modalities LIKE '%image%' THEN 1.5 ELSE 0.0 END)"
    )

    sql = f"""
        SELECT m.id, m.name, m.provider, m.context_length, m.modalities,
               m.supports_vision, m.supports_function_calling, m.supports_reasoning,
               m.open_source, m.release_date, m.description, m.category,
               p.input_per_mtok, p.output_per_mtok, p.cache_read_per_mtok,
               {heat_expr} AS heat
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
        # 厂商 + 该分类下的模型数（用于下拉里显示 "(12)"）
        providers = [
            {"name": r["provider"], "count": r["c"]}
            for r in conn.execute(
                "SELECT provider, COUNT(*) AS c FROM models "
                "WHERE provider IS NOT NULL AND category = ? "
                "GROUP BY provider ORDER BY provider",
                (category,),
            )
        ]
        # 当前分类下所有模型的热度最大值（用于前端热度条归一化）
        # 全部在 SQL 算，ORDER BY 同理 — 避免 Python 后处理导致排序错乱
        max_heat_row = conn.execute(
            f"SELECT MAX(heat) AS m FROM (SELECT {heat_expr} AS heat "
            f"FROM models m WHERE m.category = ?)",
            (category,),
        ).fetchone()
        max_heat = max_heat_row["m"] or 0

    return {"items": rows, "total": total, "providers": providers, "max_heat": max_heat}


@router.get("/api/events")
def list_events(
    category: str | None = Query(None, pattern=f"^({_CATEGORY_PATTERN})$"),
    limit: int = Query(50, ge=1, le=500),
):
    # 按分类过滤：seed 等无 model_id 的全局事件永远保留；其它按 JOIN 的 category 匹配
    where = "WHERE e.model_id IS NULL OR m.category = ?" if category else ""
    sql_params: list = [category] if category else []
    sql = f"""
        SELECT e.id, e.type, e.model_id, e.title, e.before_value, e.after_value, e.published_at
        FROM events e
        LEFT JOIN models m ON m.id = e.model_id
        {where}
        ORDER BY e.published_at DESC, e.id DESC
        LIMIT ?
    """
    with get_conn() as conn:
        rows = [dict(r) for r in conn.execute(sql, sql_params + [limit])]
        total_row = conn.execute(
            f"SELECT COUNT(*) AS c FROM events e LEFT JOIN models m ON m.id = e.model_id {where}",
            sql_params,
        ).fetchone()
        total = total_row["c"]
    return {"items": rows, "total": total}


@router.post("/api/refresh")
def refresh():
    """启动后台采集，立即返回。进度与结果通过 GET /api/refresh 轮询。"""
    return jobs.start(ingest)


@router.get("/api/refresh")
def refresh_status():
    return jobs.snapshot()
