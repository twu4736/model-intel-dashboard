"""采集编排：OpenRouter(主) + LiteLLM(补) + HuggingFace(热度) → 合并 → diff → 落库。"""
from __future__ import annotations

import sqlite3
from typing import Callable, Optional

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


def ingest(
    conn: sqlite3.Connection,
    report: Optional[Callable[[str], None]] = None,
) -> dict:
    def say(stage: str) -> None:
        if report:
            report(stage)

    warnings: list[str] = []

    say("拉取 OpenRouter 模型列表…")
    models = openrouter.collect()

    try:
        say("拉取 LiteLLM 补充数据…")
        ll = litellm.collect()
    except Exception:  # LiteLLM 是补充源，失败不阻断主流程
        ll = {}
        warnings.append("LiteLLM 补充数据拉取失败，能力标志/兜底定价可能不全")

    # 收集所有 hugging_face_id，交给 HF 采集器（热门榜命中 + 未命中的并发补查）
    hf_ids = [m.hugging_face_id for m in models if m.hugging_face_id]
    try:
        say("拉取 HuggingFace 热门榜…")
        hf = huggingface.collect(missing_ids=hf_ids, report=say)
    except Exception:  # HF 同为补充源，失败不阻断
        hf = {}
        warnings.append("HuggingFace 热度拉取失败，下载量/点赞列为空")

    merged = [_apply_hf(_merge(m, ll), hf) for m in models]
    hf_matched = sum(1 for m in merged if m.hf_downloads is not None)

    say("对比差异并落库…")
    result = diff_and_persist(conn, merged)
    result["hf_matched"] = hf_matched
    result["warnings"] = warnings
    return result
