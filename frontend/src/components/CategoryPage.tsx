import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import EventFeed from "./EventFeed";
import ModelTable from "./ModelTable";
import Layout from "./Layout";
import { fetchEvents, fetchModels, fetchRefreshStatus, refresh } from "../api";
import { CATEGORIES, categoryFromPath } from "../categories";
import type { EventRow, JobState, ModelRow, SortField } from "../types";
import { IconRefresh, IconSearch } from "./icons";

const PAGE = 50;

const SORT_PRESETS: { value: string; label: string }[] = [
  { value: "release_date:desc", label: "最新发布" },
  { value: "heat:desc", label: "热度 ↓（热门）" },
  { value: "heat:asc", label: "热度 ↑（冷门）" },
  { value: "input_per_mtok:asc", label: "输入价 ↑" },
  { value: "input_per_mtok:desc", label: "输入价 ↓" },
  { value: "output_per_mtok:asc", label: "输出价 ↑" },
  { value: "context_length:desc", label: "上下文最长" },
  { value: "name:asc", label: "名称 A-Z" },
];

export default function CategoryPage() {
  const params = useParams<{ category: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const category = categoryFromPath(params.category);

  const search = searchParams.get("search") ?? "";
  const provider = searchParams.get("provider") ?? "";
  const visionOnly = searchParams.get("vision") === "1";
  const reasoningOnly = searchParams.get("reasoning") === "1";
  const fcOnly = searchParams.get("fc") === "1";
  const openSourceOnly = searchParams.get("open") === "1";
  const sort = (searchParams.get("sort") ?? "release_date") as SortField;
  const order = (searchParams.get("order") ?? "desc") as "asc" | "desc";
  const offset = Number(searchParams.get("offset") ?? "0") || 0;

  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => setSearchInput(search), [search]);

  const [rows, setRows] = useState<ModelRow[]>([]);
  const [total, setTotal] = useState(0);
  const [providers, setProviders] = useState<{ name: string; count: number }[]>([]);
  const [maxHeat, setMaxHeat] = useState(0);
  const [events, setEvents] = useState<EventRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const toastTimer = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);

  // 搜索防抖
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchInput !== search) {
        const next = new URLSearchParams(searchParams);
        if (searchInput) next.set("search", searchInput);
        else next.delete("search");
        next.delete("offset");
        setSearchParams(next, { replace: true });
      }
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const setParam = (key: string, val: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (val === null || val === "") next.delete(key);
    else next.set(key, val);
    if (key !== "offset") next.delete("offset");
    setSearchParams(next, { replace: true });
  };

  const loadModels = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const r = await fetchModels(
        {
          category,
          search: search || undefined,
          provider: provider || undefined,
          vision: visionOnly || undefined,
          reasoning: reasoningOnly || undefined,
          function_calling: fcOnly || undefined,
          open_source: openSourceOnly || undefined,
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
      setMaxHeat(r.max_heat);
    } catch (e) {
      if ((e as Error).name !== "AbortError") showToast("加载失败：" + (e as Error).message);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [category, search, provider, visionOnly, reasoningOnly, fcOnly, openSourceOnly, sort, order, offset, showToast]);

  const loadEvents = useCallback(async () => {
    try {
      const r = await fetchEvents(50, category);
      setEvents(r.items);
    } catch {
      /* 事件流失败不影响主表格 */
    }
  }, [category]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (tick > 0) {
      loadModels();
      loadEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  useEffect(() => {
    fetchRefreshStatus()
      .then((j) => {
        setJob(j);
        if (j.status === "running") setRefreshing(true);
      })
      .catch(() => {});
  }, []);

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
          setRefreshing(false);
        }
      } catch {
        /* 瞬时网络失败，下一轮重试 */
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [refreshing, showToast]);

  const onSort = (f: SortField) => {
    const nextOrder = f === sort ? (order === "asc" ? "desc" : "asc") : "asc";
    const next = new URLSearchParams(searchParams);
    next.set("sort", f);
    next.set("order", nextOrder);
    next.delete("offset");
    setSearchParams(next, { replace: true });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } catch (e) {
      setRefreshing(false);
      showToast("采集失败：" + (e as Error).message);
    }
  };

  const resetFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("search");
    next.delete("provider");
    next.delete("vision");
    next.delete("reasoning");
    next.delete("fc");
    next.delete("open");
    next.delete("offset");
    setSearchParams(next, { replace: true });
    setSearchInput("");
  };

  const anyFilter = search || provider || visionOnly || reasoningOnly || fcOnly || openSourceOnly;

  const sortValue = `${sort}:${order}`;

  return (
    <Layout category={category}>
      <div className="stat-row">
        <div className="stat-card" style={{ animationDelay: "0ms" }}>
          <div className="stat-label">当前分类</div>
          <div className="stat-value">{CATEGORIES[category].label}</div>
          <div className="stat-meta">{total} 个模型</div>
        </div>
        <div className="stat-card" style={{ animationDelay: "60ms" }}>
          <div className="stat-label">厂商数</div>
          <div className="stat-value">{providers.length}</div>
          <div className="stat-meta">distinct providers</div>
        </div>
        <div className="stat-card" style={{ animationDelay: "120ms" }}>
          <div className="stat-label">最高热度</div>
          <div className="stat-value">{maxHeat > 0 ? maxHeat.toFixed(1) : "—"}</div>
          <div className="stat-meta">{maxHeat > 0 ? "category peak" : "no HF data"}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <IconSearch size={15} className="search-icon" />
          <input
            placeholder={`搜索 ${CATEGORIES[category].label}，如 gpt / claude / deepseek`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="search-input"
          />
        </div>
        <select
          value={provider}
          onChange={(e) => setParam("provider", e.target.value || null)}
        >
          <option value="">全部厂商</option>
          {providers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name} ({p.count})
            </option>
          ))}
        </select>
        <select
          value={sortValue}
          onChange={(e) => {
            const [s, o] = e.target.value.split(":") as [SortField, "asc" | "desc"];
            const next = new URLSearchParams(searchParams);
            next.set("sort", s);
            next.set("order", o);
            next.delete("offset");
            setSearchParams(next, { replace: true });
          }}
        >
          {!SORT_PRESETS.some((p) => p.value === sortValue) && (
            <option value={sortValue}>当前排序（表头切换）</option>
          )}
          {SORT_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <button
          className="btn ghost"
          onClick={() => setParam("vision", visionOnly ? null : "1")}
          data-active={visionOnly || undefined}
        >
          {visionOnly ? "✓ " : ""}视觉
        </button>
        <button
          className="btn ghost"
          onClick={() => setParam("reasoning", reasoningOnly ? null : "1")}
          data-active={reasoningOnly || undefined}
        >
          {reasoningOnly ? "✓ " : ""}推理
        </button>
        <button
          className="btn ghost"
          onClick={() => setParam("fc", fcOnly ? null : "1")}
          data-active={fcOnly || undefined}
        >
          {fcOnly ? "✓ " : ""}工具
        </button>
        <button
          className="btn ghost"
          onClick={() => setParam("open", openSourceOnly ? null : "1")}
          data-active={openSourceOnly || undefined}
        >
          {openSourceOnly ? "✓ " : ""}开源
        </button>
        {anyFilter && (
          <button className="btn ghost" onClick={resetFilters}>重置筛选</button>
        )}
        <button
          className={"btn primary" + (refreshing ? " is-loading" : "")}
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <span className="spinner" aria-hidden />
          ) : (
            <IconRefresh size={14} />
          )}
          {refreshing ? (job?.stage || "采集中…") : "立即采集"}
        </button>
      </div>

      {refreshing && job?.stage ? (
        <div className="stage-bar">
          <span className="stage-dot" />
          {job.stage}
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}

      <div className="card">
        {loading ? (
          <div className="loading">
            <span className="spinner" aria-hidden />
            <span style={{ marginLeft: 8 }}>加载中…</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty">没有匹配的模型</div>
        ) : (
          <>
            <ModelTable rows={rows} sort={sort} order={order} onSort={onSort} maxHeat={maxHeat} />
            {total > 0 ? (
              <div className="pager">
                <span className="pager-info">
                  第 {offset + 1}–{Math.min(offset + rows.length, total)} 条，共 {total} 条
                </span>
                <span className="pager-actions">
                  <button
                    className="btn ghost"
                    disabled={offset === 0}
                    onClick={() => setParam("offset", String(Math.max(0, offset - PAGE)))}
                  >
                    上一页
                  </button>
                  <button
                    className="btn ghost"
                    disabled={offset + rows.length >= total}
                    onClick={() => setParam("offset", String(offset + PAGE))}
                  >
                    下一页
                  </button>
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>

      <EventFeed events={events} />
      {events.length > 0 ? (
        <div className="refresh-row">
          <button className="btn ghost small" onClick={loadEvents}>刷新事件流</button>
        </div>
      ) : null}
    </Layout>
  );
}