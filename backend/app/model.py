"""统一的数据模型 + 单位换算工具。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


def per_mtok(value) -> Optional[float]:
    """把"每 token 美元费用"（字符串或数字）换算成"每 1M token 美元费用"。

    OpenRouter / LiteLLM 的定价都是 per-token，看板里展示 per-MTok 更直观。
    """
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if v == 0:
        return 0.0
    if v < 0:
        # OpenRouter 对部分聚合/路由模型用负数占位，视为无效价格
        return None
    return round(v * 1_000_000, 4)


@dataclass
class ModelRecord:
    """从各数据源归一化后的模型记录。"""

    id: str                       # 规范 id，如 "openai/gpt-4o"
    name: str
    provider: Optional[str]
    context_length: Optional[int]
    input_per_mtok: Optional[float]
    output_per_mtok: Optional[float]
    cache_read_per_mtok: Optional[float]
    modalities: str               # "text+image->text"
    supports_vision: bool
    supports_function_calling: bool
    supports_reasoning: bool
    open_source: Optional[bool]   # True/False/None(未知)
    release_date: Optional[str]   # ISO yyyy-mm-dd
    description: Optional[str]
    source: str
    hugging_face_id: Optional[str] = None   # 用于匹配 HF 热度
    hf_downloads: Optional[int] = None      # 30 天下载量（热度代理）
    hf_likes: Optional[int] = None          # 点赞数
