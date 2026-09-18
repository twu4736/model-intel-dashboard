"""统一的数据模型 + 单位换算工具。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional


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


# 分类常量（前后端共享语义，前端 categories.ts 镜像）
CATEGORY_LLM = "llm"
CATEGORY_MULTIMODAL = "multimodal"
CATEGORY_IMAGE = "image"
CATEGORY_AUDIO = "audio"


def compute_category(in_mods: Optional[Iterable[str]], out_mods: Optional[Iterable[str]]) -> str:
    """按主功能互斥分类：图像生成 > 语音 > 多模态 > LLM。

    - 输出含 image/video → 图像生成（含视频生成，作为媒体生成统一桶）
    - 输入/输出含 audio 且非图像生成 → 语音
    - 输入含 image（且非图像生成/语音） → 多模态
    - 其余 → 大语言模型
    """
    in_set = set(in_mods or [])
    out_set = set(out_mods or [])
    if out_set & {"image", "video"}:
        return CATEGORY_IMAGE
    if in_set & {"audio"} or out_set & {"audio"}:
        return CATEGORY_AUDIO
    if in_set & {"image"}:
        return CATEGORY_MULTIMODAL
    return CATEGORY_LLM


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
    category: str = CATEGORY_LLM  # 按模态互斥归类，见 compute_category()
    hugging_face_id: Optional[str] = None   # 用于匹配 HF 热度
    hf_downloads: Optional[int] = None      # 30 天下载量（热度代理）
    hf_likes: Optional[int] = None          # 点赞数
