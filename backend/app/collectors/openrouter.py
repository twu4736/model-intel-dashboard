"""OpenRouter 采集器：一次调用拿到全量模型 + 定价 + 能力。主数据源。"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import httpx

from ..model import ModelRecord, per_mtok

OPENROUTER_URL = "https://openrouter.ai/api/v1/models"
TIMEOUT = 30.0
UA = "model-intel/0.1 (+https://openrouter.ai/api/v1/models)"


def fetch_raw() -> dict:
    r = httpx.get(OPENROUTER_URL, timeout=TIMEOUT, headers={"User-Agent": UA})
    r.raise_for_status()
    return r.json()


def parse(m: dict) -> Optional[ModelRecord]:
    mid = m.get("id")
    if not mid:
        return None
    name = m.get("name") or mid
    provider = mid.split("/", 1)[0] if "/" in mid else "unknown"

    top = m.get("top_provider") or {}
    ctx = m.get("context_length") or top.get("context_length")

    pricing = m.get("pricing") or {}
    inp = per_mtok(pricing.get("prompt"))
    out = per_mtok(pricing.get("completion"))
    cache = per_mtok(pricing.get("input_cache_read"))

    arch = m.get("architecture") or {}
    in_mod = arch.get("input_modalities") or []
    out_mod = arch.get("output_modalities") or []
    modalities = f"{'+'.join(in_mod) or 'text'}->{'+'.join(out_mod) or 'text'}"

    sup_params = set(m.get("supported_parameters") or [])
    supports_vision = "image" in in_mod
    supports_fc = any(p in sup_params for p in ("tools", "tool_choice"))
    reasoning = m.get("reasoning") or {}
    supports_reasoning = ("include_reasoning" in sup_params) or bool(reasoning.get("supported_efforts"))

    hf_id = m.get("hugging_face_id")
    # 有 HuggingFace id → 视为开源权重；为空则未知（不冒进标为闭源）
    open_source: Optional[bool] = True if hf_id else None

    # 透传 hf_id，ingest 阶段用它匹配 HF 热度数据
    hf_id_clean: Optional[str] = hf_id if hf_id else None

    release_date = None
    created = m.get("created")
    if created:
        try:
            release_date = datetime.fromtimestamp(int(created), tz=timezone.utc).strftime("%Y-%m-%d")
        except (TypeError, ValueError, OSError, OverflowError):
            pass

    return ModelRecord(
        id=mid,
        name=name,
        provider=provider,
        context_length=ctx,
        input_per_mtok=inp,
        output_per_mtok=out,
        cache_read_per_mtok=cache,
        modalities=modalities,
        supports_vision=supports_vision,
        supports_function_calling=supports_fc,
        supports_reasoning=supports_reasoning,
        open_source=open_source,
        release_date=release_date,
        description=m.get("description"),
        source="openrouter",
        hugging_face_id=hf_id_clean,
    )


def collect() -> list[ModelRecord]:
    data = fetch_raw()
    items = data.get("data") if isinstance(data, dict) else data
    out: list[ModelRecord] = []
    for m in items or []:
        rec = parse(m)
        if rec:
            out.append(rec)
    return out
