# 全球模型情报看板

一个聚合全球主流大语言模型**发布、定价、能力变更**的情报看板。每次采集自动 diff 出"新模型上线 / 价格变动 / 模型下架"事件，省去手工跟踪各家厂商官网的麻烦。

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

`diff` 是情报看板的核心：它把"重新拉一份全量数据"转成可读事件。数据库无变化时不产生任何噪音事件。下架检测带安全阀——采集结果相对库存异常偏少（上游故障）时跳过，避免误删。

采集是**后台任务**：`POST /api/refresh` 立即返回，前端轮询 `GET /api/refresh` 展示阶段进度（拉主源 → 补充源 → HF 热门榜 → 并发补查 → diff 落库）；同一时刻只允许一个采集任务，避免并发 diff 产生重复事件。

## 技术栈

- **后端**：Python 3.11+ · FastAPI · httpx · SQLite
- **前端**：React 18 · TypeScript · Vite

## 项目结构

```
├── backend/
│   ├── app/
│   │   ├── model.py              # 统一 ModelRecord + per-MTok 换算
│   │   ├── db.py                 # SQLite 连接与 schema
│   │   ├── collectors/
│   │   │   ├── openrouter.py     # 主数据源采集器
│   │   │   ├── litellm.py        # 补充源采集器
│   │   │   └── huggingface.py    # 热度源采集器（热门榜 + 并发补查）
│   │   ├── services/
│   │   │   ├── ingest.py         # 采集编排 + 字段合并 + 进度上报
│   │   │   ├── diff.py           # diff 检测 + 事件生成（含下架检测）+ 落库
│   │   │   └── jobs.py           # 后台采集任务（单实例 + 进度快照）
│   │   ├── routers/api.py        # /api/models /api/events /api/refresh
│   │   └── main.py               # FastAPI 入口，空库时后台播种
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.tsx               # 主界面：工具栏 + 表格 + 事件流 + 采集进度轮询
    │   ├── api.ts                # API 客户端（支持 AbortSignal 取消）
    │   ├── types.ts              # 类型定义
    │   ├── utils.ts              # 价格/上下文/时间格式化
    │   └── components/
    │       ├── ModelTable.tsx    # 模型表格（搜索/筛选/排序/分页）
    │       └── EventFeed.tsx     # 变更事件流
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
npm install
npm run dev
```

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/models` | 模型列表，支持 `search` `provider` `vision` `sort` `order` `limit` `offset`；默认按发布时间倒序，排序带稳定兜底键 |
| GET | `/api/events` | 变更事件流（按时间倒序），返回 `items` + `total` |
| POST | `/api/refresh` | 启动后台采集（立即返回 `{started, job}`，已在采集时 `started=false`） |
| GET | `/api/refresh` | 采集任务状态快照：`status` `stage` `result` `error` |

## 功能

- 默认「最新发布」视图；可搜索 / 按厂商筛选 / 仅看视觉 / 任意列排序 / 分页的模型表格
- 定价展示为"每 1M token 美元"，免费模型标绿，缺失标 —
- 能力标签：视觉 / 推理 / 工具调用 / 开源；模型名悬浮显示描述
- 变更事件流：新模型上线、价格变动（前后值对比）、模型下架（红点）
- 一键采集：后台执行 + 实时阶段进度 + 完成摘要（含补充源失败警告）
- 变体 SKU（`:batch` / `:free`）入库但不产生事件，事件流无噪音

## 后续可扩展

- 接入 LMSYS Arena / Artificial Analysis 排名与图表（价格曲线、上下文-成本散点）
- 厂商 RSS / GitHub releases 跟踪新发布
- 定时自动采集（cron / GitHub Actions）+ 变更推送（Telegram / Discord / 邮件）
- Docker 部署
