# 全球模型情报看板

一个聚合全球主流大语言模型**发布、定价、能力变更**的情报看板。按主功能互斥分到大语言模型 / 多模态 / 图像 / 语音四类页面，每次采集自动 diff 出"新模型 / 价格变动 / 模型下架"事件，省去手工跟踪各家厂商官网的麻烦。

## 数据来源

| 来源 | 提供内容 | 角色 |
|---|---|---|
| [OpenRouter](https://openrouter.ai/api/v1/models) `/api/v1/models` | 全量模型 id/名称、上下文长度、模态、per-token 定价、发布时间、能力参数 | **主数据源** |
| [LiteLLM](https://github.com/BerriAI/litellm) `model_prices_and_context_window.json` | 能力标志（vision/function_calling/reasoning）、兜底定价、deprecation | **补充源** |
| [HuggingFace](https://huggingface.co/api/models) `/api/models` | 30 天下载量、点赞数（开源模型热度代理） | **热度源** |

无需爬各家官网——这三个公开数据源已覆盖数百个模型（含 OpenAI / Anthropic / Google / Z.ai / DeepSeek / Qwen / Meta 等）。

## 工作原理

```
collect(OpenRouter) ─┐
collect(LiteLLM) ────┼─→ normalize ─→ merge ─→ diff(对比上次) ─→ persist ─→ API ─→ 看板
collect(HuggingFace)─┘                  │
                                        ├─ 新模型  → new_model 事件（变体 SKU 如 :batch/:free 不发事件）
                                        ├─ 价格变  → price_change 事件
                                        └─ 已下架  → deprecation 事件 + 删除陈旧行
```

`diff` 是情报看板的核心：把"重新拉一份全量数据"转成可读事件。数据库无变化时不产生任何噪音事件。下架检测带安全阀——采集结果相对库存异常偏少（上游故障）时跳过，避免误删。

采集是**后台任务**：`POST /api/refresh` 立即返回，前端轮询 `GET /api/refresh` 展示阶段进度（拉主源 → 补充源 → HF 热门榜 → 并发补查 → diff 落库）；同一时刻只允许一个采集任务，避免并发 diff 产生重复事件。

## 分类规则

按模态互斥分到 4 类，落到 `models.category` 列，渲染到 4 个独立 URL：

| 分类 | URL | 规则 |
|------|-----|------|
| 图像 | `/image` | 输出含 image / video（视频生成归入媒体生成统一桶） |
| 语音 | `/audio` | 输入或输出含 audio（且不是图像） |
| 多模态 | `/multimodal` | 输入含 image（且不是图像 / 语音） |
| 大语言模型 | `/llm` | 其余（纯 text→text） |

例：GPT-4o 因支持图像输入归入「多模态」；DALL·E 因输出图像归入「图像」；Gemini Flash 含 audio 输入归入「语音」。

## 热度计算

单一数值替代原始的下载量 / 点赞两列：

```
HF 可达时：   heat = log10(1 + 下载量) × 2 + log10(1 + 点赞)
HF 不可达时： heat = 开源(+3) + log10(1 + 上下文) + 多模态(+1.5)
```

- **对数压缩**：少数模型下载量上亿而大多数几百，log10 把量级差从 10000× 压到 ~5×
- **权重 2 : 1**：下载量代表实际使用，点赞代表社区认可
- **代理三轴**：开源（社区可本地运行）、上下文（log 缩放）、多模态（能力更广）
- **SQL 一次性算好**，`ORDER BY heat` 严格有序；前端进度条相对当前分类 max_heat 归一化
- 列头悬停可见公式 tooltip；进度条冷 / 暖 / 热三档着色（蓝 / 紫 / 金）

## 技术栈

- **后端**：Python 3.11+ · FastAPI · httpx · SQLite
- **前端**：React 18 · TypeScript · Vite · react-router-dom

## 项目结构

```
├── backend/
│   ├── app/
│   │   ├── model.py              # ModelRecord + per_mtok + compute_category() + 分类常量
│   │   ├── db.py                 # SQLite 连接 + schema（含 category 列 ALTER 迁移）
│   │   ├── collectors/
│   │   │   ├── openrouter.py     # 主数据源（含分类计算）
│   │   │   ├── litellm.py        # 补充源
│   │   │   └── huggingface.py    # 热度源（热门榜 + 并发补查）
│   │   ├── services/
│   │   │   ├── ingest.py         # 采集编排 + 字段合并 + 进度上报
│   │   │   ├── diff.py           # diff 检测 + 事件生成 + 落库
│   │   │   └── jobs.py           # 后台采集任务（单实例 + 进度快照）
│   │   ├── routers/api.py        # /api/models（category/能力筛选） /api/events /api/refresh
│   │   └── main.py               # FastAPI 入口，空库时后台播种 + 托管前端构建产物
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.tsx               # 路由壳（/、/llm、/multimodal、/image、/audio）
    │   ├── api.ts                # API 客户端（AbortSignal 取消）
    │   ├── categories.ts         # 4 分类常量 + 反查
    │   ├── types.ts              # 类型定义（含 heat 字段）
    │   ├── utils.ts              # 价格 / 上下文 / 热度格式化
    │   └── components/
    │       ├── Layout.tsx        # 侧边栏 + 主区骨架
    │       ├── CategoryPage.tsx  # 单分类页主体（URL 状态 + toolbar + 表格 + 事件流）
    │       ├── ModelTable.tsx    # 模型表格（含热度列 + sticky 表头）
    │       ├── EventFeed.tsx     # 变更事件流（错峰 slide-in）
    │       └── icons.tsx         # 内联 SVG 图标（Chat/Eye/Image/Mic/Refresh 等）
    └── vite.config.ts
```

## 快速开始

### 1. 后端

```powershell
# 在项目根目录
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt

# 启动（空库时自动在后台初始导入，不阻塞服务；看板上会显示导入进度）
uvicorn app.main:app --port 8000 --app-dir backend
```

> 如果系统是 Python 3.14 的 free-threaded 版本，`uvicorn[standard]` 的 `watchfiles` 会编译失败。本项目的 requirements 已用纯 Python 版 `uvicorn`（无 `[standard]`）规避此问题。

### 2. 前端

**生产模式**（后端托管构建产物，访问 http://127.0.0.1:8000）：

```powershell
cd frontend
npm install
npm run build      # 产物输出到 frontend/dist，后端启动后自动托管
```

**开发模式**（热更新，访问 http://127.0.0.1:5173，API 自动代理到 8000）：

```powershell
cd frontend
npm run dev
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/models` | 模型列表，支持 `category` `search` `provider` `vision` `reasoning` `function_calling` `open_source` `sort` `order` `limit` `offset`；默认 `category=llm` |
| GET | `/api/events` | 变更事件流（按时间倒序），可选 `category`（仅返回该类相关事件，seed 等全局事件保留） |
| POST | `/api/refresh` | 启动后台采集（立即返回 `{started, job}`，已在采集时 `started=false`） |
| GET | `/api/refresh` | 采集任务状态快照：`status` `stage` `result` `error` |

`/api/models` 响应额外带 `max_heat`（当前分类最大热度），前端热度条用它归一化；`providers` 改为 `[{name, count}]`，下拉显示 `openai (12)`。

## 功能

- 4 个分类独立页面，左侧固定导航栏切换，URL 可分享 / 收藏
- 筛选状态完整持久化到 URL（`?search=&provider=&vision=&reasoning=&fc=&open=&sort=heat&order=desc`），刷新保留
- 能力筛选：视觉 / 推理 / 工具调用 / 开源 四独立 toggle
- 厂商下拉显示模型数；排序预设含「最新发布 / 热度 ↓ 热门 / 热度 ↑ 冷门 / 输入价 ↑↓ / 输出价 ↑ / 上下文最长 / 名称 A-Z」
- 表格列：模型 / 厂商 / 上下文 / 输入价 / 输出价 / **热度**（数值 + 渐变进度条 + 三档着色）/ 发布 / 能力标签
- 定价展示为"每 1M token 美元"，免费模型标绿，缺失标 —
- 能力标签：视觉 / 推理 / 工具调用 / 开源；模型名悬浮显示描述
- 变更事件流（每页只显示该类相关事件）：新模型上线、价格变动（前后值对比）、模型下架（红点）
- 一键采集：后台执行 + 实时阶段进度 + 完成摘要（含补充源失败警告）
- 变体 SKU（`:batch` / `:free`）入库但不产生事件，事件流无噪音
- 视觉风格：深色主题 + 双 radial-gradient 背景 + 9 档面板色 + sticky 表头 + 入场 / hover / 侧滑 / spin 动画

## 后续可扩展

- 接入 LMSYS Arena / Artificial Analysis 排名与图表（价格曲线、上下文-成本散点）
- 厂商 RSS / GitHub releases 跟踪新发布
- 定时自动采集（cron / GitHub Actions）+ 变更推送（Telegram / Discord / 邮件）
- Docker 部署
- 给热度加更多代理轴（provider 名气、supported_parameters 数量、发布时间新鲜度）