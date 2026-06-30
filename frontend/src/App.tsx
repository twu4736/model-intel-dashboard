import { useCallback, useEffect, useState } from "react";
import EventFeed from "./components/EventFeed";
import ModelTable from "./components/ModelTable";
import { fetchEvents, fetchModels, refresh } from "./api";
import type { EventRow, ModelRow, SortField } from "./types";

const PAGE = 50;

export default function App() {
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [total, setTotal] = useState(0);
  const [providers, setProviders] = useState<string[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);

  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("");
  const [visionOnly, setVisionOnly] = useState(false);
  const [sort, setSort] = useState<SortField>("hf_downloads");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [offset, setOffset] = useState(0);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchModels({
        search: search || undefined,
        provider: provider || undefined,
        vision: visionOnly || undefined,
        sort,
        order,
        limit: PAGE,
        offset,
      });
      setRows(r.items);
      setTotal(r.total);
      setProviders(r.providers);
    } catch (e) {
      setToast("加载失败：" + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, provider, visionOnly, sort, order, offset]);

  const loadEvents = useCallback(async () => {
    try {
      const r = await fetchEvents(50);
      setEvents(r.items);
    } catch {
      /* 事件流失败不影响主表格 */
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

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
      const r = await refresh();
      setToast(`采集完成：${r.models} 个模型 · 新增 ${r.new} · 价格变动 ${r.price_changes}`);
      await Promise.all([loadModels(), loadEvents()]);
    } catch (e) {
      setToast("采集失败：" + (e as Error).message);
    } finally {
      setRefreshing(false);
      setTimeout(() => setToast(null), 5000);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setProvider("");
    setVisionOnly(false);
    setOffset(0);
  };

  return (
    <div className="app">
      <div className="header">
        <h1>全球模型情报看板</h1>
        <span className="sub">
          聚合 OpenRouter + LiteLLM，追踪模型发布、定价与能力变更
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
          <div className="v">{events.length}</div>
          <div className="l">变更事件</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="搜索模型名或 id，如 gpt-5 / glm / claude"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
        />
        <select value={provider} onChange={(e) => { setProvider(e.target.value); setOffset(0); }}>
          <option value="">全部厂商</option>
          {providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={`${sort}:${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split(":") as [SortField, "asc" | "desc"];
            setSort(s);
            setOrder(o);
            setOffset(0);
          }}
        >
          <option value="hf_downloads:desc">最热门（下载量）</option>
          <option value="hf_likes:desc">最多点赞</option>
          <option value="input_per_mtok:asc">输入价 ↑</option>
          <option value="input_per_mtok:desc">输入价 ↓</option>
          <option value="output_per_mtok:asc">输出价 ↑</option>
          <option value="context_length:desc">上下文最长</option>
          <option value="release_date:desc">最新发布</option>
          <option value="name:asc">名称 A-Z</option>
        </select>
        <button
          className="btn ghost"
          onClick={() => { setVisionOnly((v) => !v); setOffset(0); }}
          style={visionOnly ? { borderColor: "var(--green)", color: "var(--green)" } : undefined}
        >
          {visionOnly ? "✓ " : ""}仅看视觉
        </button>
        <button className="btn" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "采集中…" : "立即采集"}
        </button>
      </div>

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

      <EventFeed events={events} />
      {events.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <button className="btn ghost" onClick={loadEvents}>刷新事件流</button>
        </div>
      ) : null}
    </div>
  );
}
