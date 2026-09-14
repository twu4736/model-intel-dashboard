"""HuggingFace 采集器：拉热门模型榜，建立 hf_id → {downloads, likes} 查找表。

OpenRouter 的 models 接口不带调用量；HF 的 downloads/likes 是开源模型最可靠的
"使用热度"代理信号。策略：
  1. 一次性按下载量取热门榜前 N（覆盖绝大多数会被引用的开源权重）；
  2. 对 OpenRouter 里有 hugging_face_id 但没命中榜的模型，并发补查。
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Optional

import httpx

HF_URL = "https://huggingface.co/api/models"
HF_MODEL_URL = "https://huggingface.co/api/models/{hid}"
TIMEOUT = 30.0
UA = "model-intel/0.1"
TOP_N = 1000          # 热门榜取前 1000
FALLBACK_CONCURRENCY = 10  # 补查阶段并发数


def fetch_raw(limit: int = TOP_N) -> list[dict]:
    params = {"sort": "downloads", "direction": "-1", "limit": limit}
    r = httpx.get(HF_URL, params=params, timeout=TIMEOUT, headers={"User-Agent": UA})
    r.raise_for_status()
    return r.json()


def fetch_one(client: httpx.Client, hid: str) -> dict | None:
    try:
        r = client.get(HF_MODEL_URL.format(hid=hid), timeout=TIMEOUT, headers={"User-Agent": UA})
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def _entry(it: dict) -> dict:
    return {
        "downloads": int(it.get("downloads") or 0),
        "likes": int(it.get("likes") or 0),
    }


def collect(
    missing_ids: list[str] | None = None,
    report: Optional[Callable[[str], None]] = None,
) -> dict[str, dict]:
    """返回 {hf_id: {"downloads": int, "likes": int}} 查找表。

    missing_ids 是有 hugging_face_id 但未命中热门榜的模型 id 列表，会并发补查。
    """
    lookup: dict[str, dict] = {}
    for it in fetch_raw():
        hid = it.get("id")
        if hid:
            lookup[hid] = _entry(it)

    # 对未命中的 hf_id 并发补查（httpx.Client 线程安全；串行版要几十秒）
    todo = [hid for hid in (missing_ids or []) if hid and hid not in lookup]
    if todo:
        if report:
            report(f"HuggingFace 热度补查 0/{len(todo)}…")
        with httpx.Client(headers={"User-Agent": UA}) as client:
            with ThreadPoolExecutor(max_workers=FALLBACK_CONCURRENCY) as pool:
                for i, (hid, info) in enumerate(
                    zip(todo, pool.map(lambda h: fetch_one(client, h), todo)), start=1
                ):
                    if info:
                        lookup[hid] = _entry(info)
                    if report and (i % 20 == 0 or i == len(todo)):
                        report(f"HuggingFace 热度补查 {i}/{len(todo)}…")
    return lookup
