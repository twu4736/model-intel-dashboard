"""LiteLLM 采集器：作为补充数据源，提供能力标志与兜底定价。

返回 alias -> enrichment dict 的查找表，由 ingest 阶段按多种别名匹配后合并。
"""
from __future__ import annotations

from typing import Optional

import httpx

from ..model import per_mtok

LITELLM_URL = (
    "https://raw.githubusercontent.com/BerriAI/litellm/main/"
    "model_prices_and_context_window.json"
)
TIMEOUT = 30.0
UA = "model-intel/0.1"


def fetch_raw() -> dict:
    r = httpx.get(LITELLM_URL, timeout=TIMEOUT, headers={"User-Agent": UA})
    r.raise_for_status()
    return r.json()


def _to_bool(v) -> Optional[bool]:
    if v is None:
        return None
    return bool(v)


def collect() -> dict[str, dict]:
    raw = fetch_raw()
    lookup: dict[str, dict] = {}
    for key, spec in raw.items():
        if key == "sample_spec" or not isinstance(spec, dict):
            continue
        entry = {
            "input_per_mtok": per_mtok(spec.get("input_cost_per_token")),
            "output_per_mtok": per_mtok(spec.get("output_cost_per_token")),
            "context_length": spec.get("max_input_tokens") or spec.get("max_tokens"),
            "supports_vision": _to_bool(spec.get("supports_vision")),
            "supports_function_calling": _to_bool(spec.get("supports_function_calling")),
            "supports_reasoning": _to_bool(spec.get("supports_reasoning")),
            "deprecation_date": spec.get("deprecation_date"),
        }
        # 用 key 本身和小写两种别名登记，匹配时再尝试去掉厂商前缀
        for alias in {key, key.lower()}:
            lookup[alias] = entry
    return lookup
