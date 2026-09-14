import { useCallback, useEffect, useRef, useState } from "react";
import EventFeed from "./components/EventFeed";
import ModelTable from "./components/ModelTable";
import { fetchEvents, fetchModels, fetchRefreshStatus, refresh } from "./api";
import type { EventRow, JobState, ModelRow, SortField } from "./types";

const PAGE = 50;

const SORT_PRESETS: { value: string; label: string }[] = [
  { value: "release_date:desc", label: "最新发布" },
  { value: "hf_downloads:desc", label: "最热门（下载量）" },
  { value: "hf_likes:desc", label: "最多点赞" },
  { value: "input_per_mtok:asc", label: "输入价 ↑" },
  { value: "input_per_mtok:desc", label: "输入价 ↓" },
  { value: "output_per_mtok:asc", label: "输出价 ↑" },
  { value: "context_length:desc", label: "上下文最长" },
  { value: "name:asc", label: "名称 A-Z" },
];

export default function App() {
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [total, setTotal] = useState(0);
  const [providers, setProviders] = useState<string[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("");
  const [visionOnly, setVisionOnly] = useState(false);
  const [sort, setSort] = useState<SortField>("release_date");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [offset, setOffset] = useState(0);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // 采集完成后触发数据重载

  const toastTimer = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);

  // 搜索防抖：输入停顿 300ms 后才发请求，避免逐键请求
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput);
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const loadModels = useCallback(async () => {
    // 取消上一个未完成请求，避免响应乱序导致显示过期结果
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const r = await fetchModels(
        {
          search: search || undefined,
          provider: provider || undefined,
          vision: visionOnly || undefined,
          sort,
          order,
          limit: PAGE,
          offset,
        },
        ac.signal,
      );
      if (ac.signal.aborted) return;
      setRows(r.items);
      setTotal(r.total);
      setProviders(r.providers);
    } catch (e) {
      if ((e as Error).name !== "AbortError") showToast("加载失败：" + (e as Error).message);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [search, provider, visionOnly, sort, order, offset, showToast]);

  const loadEvents = useCallback(async () => {
    try {
      const r = await fetchEvents(50);
      setEvents(r.items);
      setEventsTotal(r.total);
    } catch {
      /* 事件流失败不影响主表格 */
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // 采集完成后重载数据（tick 从 0 变化时触发）
  useEffect(() => {
    if (tick > 0) {
      loadModels();
      loadEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // 启动时检查是否有正在进行的采集（含后端首次启动的后台初始导入）
  useEffect(() => {
    fetchRefreshStatus()
      .then((j) => {
        setJob(j);
        if (j.status === "running") setRefreshing(true);
      })
      .catch(() => {});
  }, []);

  // 轮询采集进度
  useEffect(() => {
    if (!refreshing) return;
    const id = window.setInterval(async () => {
      try {
        const j = await fetchRefreshStatus();
        setJob(j);
        if (j.status === "done") {
          setRefreshing(false);
          setTick((t) => t + 1);
          const r = j.result;
          if (r) {
            const parts = [`采集完成：${r.models} 个模型 · 新增 ${r.new} · 价格变动 ${r.price_changes}`];
            if (r.deprecated) parts.push(`下架 ${r.deprecated}`);
            if (r.warnings?.length) parts.push(`⚠ ${r.warnings.join("；")}`);
            showToast(parts.join(" · "));
          }
        } else if (j.status === "error") {
          setRefreshing(false);
          showToast("采集失败：" + (j.error ?? "未知错误"));
        } else if (j.status === "idle") {
          setRefreshing(false); // 服务重启等场景
        }
      } catch {
        /* 瞬时网络失败，下一轮重试 */
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [refreshing, showToast]);

  const onSort = (f: SortField) => {
    if (f === sort) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(f);
      setOrder("asc");
    }
    setOffset(0);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh(); // 立即返回，进度走轮询（已在采集中时 started=false，同样轮询）
    } catch (e) {
      setRefreshing(false);
      showToast("采集失败：" + (e as Error).message);
    }
  };

  const resetFilters = () => {
    setSearchInput("");
    setSearch("");
    setProvider("");
    setVisionOnly(false);
    setOffset(0);
  };

  const sortValue = `${sort}:${order}`;

  return (
    <div className="app">
      <div className="header">
        <h1>全球模型情报看板</h1>
        <span className="sub">
          聚合 OpenRouter + LiteLLM + HuggingFace，追踪模型发布、定价与能力变更
        </span>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="v">{total}</div>
          <div className="l">模型总数</div>
        </div>
        <div className="stat">
          <div className="v">{providers.length}</div>
          <div className="l">厂商数</div>
        </div>
        <div className="stat">
          <div className="v">{eventsTotal}</div>
          <div className="l">变更事件</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="搜索模型名或 id，如 gpt-5 / glm / claude"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select value={provider} onChange={(e) => { setProvider(e.target.value); setOffset(0); }}>
          <option value="">全部厂商</option>
          {providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={sortValue}
          onChange={(e) => {
            const [s, o] = e.target.value.split(":") as [SortField, "asc" | "desc"];
            setSort(s);
            setOrder(o);
            setOffset(0);
          }}
        >
          {/* 表头点出的排序组合不在预设里时，动态补一项，避免下拉框显示空白 */}
          {!SORT_PRESETS.some((p) => p.value === sortValue) && (
            <option value={sortValue}>当前排序（表头切换）</option>
          )}
          {SORT_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <button
          className="btn ghost"
          onClick={() => { setVisionOnly((v) => !v); setOffset(0); }}
          style={visionOnly ? { borderColor: "var(--green)", color: "var(--green)" } : undefined}
        >
          {visionOnly ? "✓ " : ""}仅看视觉
        </button>
        {(searchInput || provider || visionOnly) && (
          <button className="btn ghost" onClick={resetFilters}>重置筛选</button>
        )}
        <button className="btn" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? (job?.stage || "采集中…") : "立即采集"}
        </button>
      </div>

      {refreshing && job?.stage ? (
        <div style={{ marginBottom: 12, color: "var(--accent)", fontSize: 13 }}>{job.stage}</div>
      ) : null}

      {toast ? (
        <div style={{ marginBottom: 12, color: "var(--amber)", fontSize: 13 }}>{toast}</div>
      ) : null}

      {loading ? (
        <div className="loading">加载中…</div>
      ) : rows.length === 0 ? (
        <div className="empty">没有匹配的模型</div>
      ) : (
        <ModelTable rows={rows} sort={sort} order={order} onSort={onSort} />
      )}

      {total > 0 ? (
        <div className="pager">
          <span>
            第 {offset + 1}–{Math.min(offset + rows.length, total)} 条，共 {total} 条
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>
              上一页
            </button>
            <button className="btn ghost" disabled={offset + rows.length >= total} onClick={() => setOffset((o) => o + PAGE)}>
              下一页
            </button>
          </span>
        </div>
      ) : null}

      <EventFeed events={events} />
      {events.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <button className="btn ghost" onClick={loadEvents}>刷新事件流</button>
        </div>
      ) : null}
    </div>
  );
}
