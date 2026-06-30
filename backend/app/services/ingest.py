"""采集编排：OpenRouter(主) + LiteLLM(补) → 合并 → diff → 落库。"""
from __future__ import annotations

import sqlite3

from ..collectors import huggingface, litellm, openrouter
from ..model import ModelRecord
from .diff import diff_and_persist


def _merge(m: ModelRecord, ll: dict[str, dict]) -> ModelRecord:
    """用 LiteLLM 补齐 OpenRouter 缺失的字段；能力标志只升不降。"""
    keys = [m.id, m.id.lower()]
    if "/" in m.id:
        suffix = m.id.split("/", 1)[1]
        keys += [suffix, suffix.lower()]

    entry = None
    for k in keys:
        if k in ll:
            entry = ll[k]
            break
    if not entry:
        return m

    if m.input_per_mtok is None and entry["input_per_mtok"] is not None:
        m.input_per_mtok = entry["input_per_mtok"]
    if m.output_per_mtok is None and entry["output_per_mtok"] is not None:
        m.output_per_mtok = entry["output_per_mtok"]
    if m.context_length is None and entry["context_length"] is not None:
        m.context_length = entry["context_length"]
    if not m.supports_vision and entry["supports_vision"]:
        m.supports_vision = True
    if not m.supports_function_calling and entry["supports_function_calling"]:
        m.supports_function_calling = True
    if not m.supports_reasoning and entry["supports_reasoning"]:
        m.supports_reasoning = True
    return m


def _apply_hf(m: ModelRecord, hf: dict[str, dict]) -> ModelRecord:
    """按 hugging_face_id 匹配 HF 热度（下载量/点赞）。闭源模型无 hf_id，置空。"""
    if m.hugging_face_id and m.hugging_face_id in hf:
        entry = hf[m.hugging_face_id]
        m.hf_downloads = entry["downloads"]
        m.hf_likes = entry["likes"]
    return m


def ingest(conn: sqlite3.Connection) -> dict:
    models = openrouter.collect()
    try:
        ll = litellm.collect()
    except Exception as e:  # LiteLLM 是补充源，失败不应阻断主流程
        print("[ingest] litellm skipped:", e)
        ll = {}

    # 收集所有 hugging_face_id，交给 HF 采集器（热门榜命中 + 未命中的逐个补查）
    hf_ids = [m.hugging_face_id for m in models if m.hugging_face_id]
    try:
        hf = huggingface.collect(missing_ids=hf_ids)
    except Exception as e:  # HF 同为补充源，失败不阻断
        print("[ingest] huggingface skipped:", e)
        hf = {}

    merged = [_apply_hf(_merge(m, ll), hf) for m in models]
    return diff_and_persist(conn, merged)
