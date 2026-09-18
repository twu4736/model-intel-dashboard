"""diff：把本次采集结果与库中现状对比，生成"新模型 / 价格变动 / 下架"事件并落库。"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Optional

from ..model import ModelRecord


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _price_changed(a, b) -> bool:
    if a is None and b is None:
        return False
    if a is None or b is None:
        return True
    return abs(float(a) - float(b)) > 1e-6


def _fmt_price(inp, out) -> str:
    def f(v):
        return "—" if v is None else (f"${v:g}/MTok" if v else "免费")
    return f"输入 {f(inp)} · 输出 {f(out)}"


def _store_model(conn, m: ModelRecord, now: str) -> None:
    conn.execute(
        "INSERT INTO models (id, name, provider, context_length, modalities, "
        "supports_vision, supports_function_calling, supports_reasoning, open_source, "
        "release_date, description, source, category, hf_downloads, hf_likes, hugging_face_id, updated_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            m.id, m.name, m.provider, m.context_length, m.modalities,
            int(m.supports_vision), int(m.supports_function_calling), int(m.supports_reasoning),
            None if m.open_source is None else int(m.open_source),
            m.release_date, m.description, m.source, m.category,
            m.hf_downloads, m.hf_likes, m.hugging_face_id, now,
        ),
    )


def _update_model(conn, m: ModelRecord, now: str) -> None:
    conn.execute(
        "UPDATE models SET name=?, provider=?, context_length=?, modalities=?, "
        "supports_vision=?, supports_function_calling=?, supports_reasoning=?, "
        "open_source=?, release_date=?, description=?, source=?, category=?, "
        "hf_downloads=?, hf_likes=?, hugging_face_id=?, updated_at=? WHERE id=?",
        (
            m.name, m.provider, m.context_length, m.modalities,
            int(m.supports_vision), int(m.supports_function_calling), int(m.supports_reasoning),
            None if m.open_source is None else int(m.open_source),
            m.release_date, m.description, m.source, m.category,
            m.hf_downloads, m.hf_likes, m.hugging_face_id, now, m.id,
        ),
    )


def _store_price(conn, m: ModelRecord, now: str) -> None:
    conn.execute(
        "INSERT INTO prices (model_id, input_per_mtok, output_per_mtok, cache_read_per_mtok, fetched_at) "
        "VALUES (?,?,?,?,?)",
        (m.id, m.input_per_mtok, m.output_per_mtok, m.cache_read_per_mtok, now),
    )


def diff_and_persist(conn: sqlite3.Connection, models: list[ModelRecord]) -> dict:
    now = iso_now()

    existing_ids = {row["id"] for row in conn.execute("SELECT id FROM models")}
    is_seed = len(existing_ids) == 0

    # 每个 model 最新一条价格
    latest: dict[str, sqlite3.Row] = {}
    for row in conn.execute(
        "SELECT model_id, input_per_mtok, output_per_mtok FROM prices "
        "WHERE id IN (SELECT MAX(id) FROM prices GROUP BY model_id)"
    ):
        latest[row["model_id"]] = row

    new_count = 0
    price_change_count = 0
    events: list[dict] = []

    for m in models:
        # OpenRouter 的变体 SKU（:batch / :free / :extended 等）与本体几乎重复，
        # 正常入库与记价，但不产生事件，避免"新模型上线：X (batch)"这类噪音
        is_variant = ":" in m.id
        if m.id in existing_ids:
            _update_model(conn, m, now)
            prev = latest.get(m.id)
            changed = prev is None or (
                _price_changed(prev["input_per_mtok"], m.input_per_mtok)
                or _price_changed(prev["output_per_mtok"], m.output_per_mtok)
            )
            if changed:
                _store_price(conn, m, now)
                price_change_count += 1
                if not is_seed and not is_variant:
                    events.append({
                        "type": "price_change",
                        "model_id": m.id,
                        "title": f"{m.name} 价格变动",
                        "before_value": _fmt_price(prev["input_per_mtok"], prev["output_per_mtok"]) if prev else None,
                        "after_value": _fmt_price(m.input_per_mtok, m.output_per_mtok),
                        "published_at": now,
                    })
        else:
            new_count += 1
            _store_model(conn, m, now)
            _store_price(conn, m, now)
            if not is_seed and not is_variant:
                events.append({
                    "type": "new_model",
                    "model_id": m.id,
                    "title": f"新模型上线：{m.name}",
                    "before_value": None,
                    "after_value": _fmt_price(m.input_per_mtok, m.output_per_mtok),
                    "published_at": now,
                })

    # 下架检测：库里存在、本轮未再出现的模型 → 删除并记 deprecation 事件。
    # 安全阀：采集结果相对库存异常偏少时跳过，防止上游 API 部分故障导致误删全库。
    fetched_ids = {m.id for m in models}
    deprecated = 0
    if existing_ids and len(fetched_ids) >= max(10, len(existing_ids) // 2):
        for gid in sorted(existing_ids - fetched_ids):
            row = conn.execute("SELECT name FROM models WHERE id = ?", (gid,)).fetchone()
            name = row["name"] if row else gid
            prev = latest.get(gid)
            conn.execute("DELETE FROM prices WHERE model_id = ?", (gid,))
            conn.execute("DELETE FROM models WHERE id = ?", (gid,))
            deprecated += 1
            events.append({
                "type": "deprecation",
                "model_id": gid,
                "title": f"模型下架：{name}",
                "before_value": _fmt_price(prev["input_per_mtok"], prev["output_per_mtok"]) if prev else None,
                "after_value": None,
                "published_at": now,
            })

    if is_seed:
        events.append({
            "type": "seed",
            "model_id": None,
            "title": f"初始导入 {len(models)} 个模型",
            "before_value": None,
            "after_value": None,
            "published_at": now,
        })

    for e in events:
        conn.execute(
            "INSERT INTO events (type, model_id, title, before_value, after_value, published_at) "
            "VALUES (?,?,?,?,?,?)",
            (e["type"], e["model_id"], e["title"], e["before_value"], e["after_value"], e["published_at"]),
        )

    return {
        "models": len(models),
        "new": new_count,
        "price_changes": price_change_count,
        "deprecated": deprecated,
        "events": len(events),
    }
