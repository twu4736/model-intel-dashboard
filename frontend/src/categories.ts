/** 模型主功能分类（前后端共享同一份字面量）。 */

export type Category = "llm" | "multimodal" | "image" | "audio";

export const DEFAULT_CATEGORY: Category = "llm";

export const CATEGORIES: Record<
  Category,
  { label: string; path: string; hint: string }
> = {
  llm: {
    label: "大语言模型",
    path: "/llm",
    hint: "纯文本对话模型：GPT-5、Claude Sonnet、DeepSeek、Qwen…",
  },
  multimodal: {
    label: "多模态模型",
    path: "/multimodal",
    hint: "可理解图像输入的 LLM：GPT-4o、Gemini、Claude Opus 视觉…",
  },
  image: {
    label: "图像模型",
    path: "/image",
    hint: "图像/视频生成模型：DALL·E、Imagen、Flux、Sora…",
  },
  audio: {
    label: "语音模型",
    path: "/audio",
    hint: "语音识别 / 合成 / 实时对话模型：Whisper、TTS…",
  },
};

/** 从路径段（如 "multimodal"，无前导斜杠）反查分类，找不到则返回默认分类。 */
export function categoryFromPath(segment: string | undefined): Category {
  if (!segment) return DEFAULT_CATEGORY;
  for (const k of Object.keys(CATEGORIES) as Category[]) {
    if (CATEGORIES[k].path === `/${segment}`) return k;
  }
  return DEFAULT_CATEGORY;
}