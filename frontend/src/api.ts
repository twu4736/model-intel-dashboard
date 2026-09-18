import type {
  EventsResponse,
  JobState,
  ModelsResponse,
  RefreshStartResponse,
  SortField,
} from "./types";
import type { Category } from "./categories";

async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`);
  return (await r.json()) as T;
}

export function fetchModels(
  params: {
    category: Category;
    search?: string;
    provider?: string;
    vision?: boolean;
    reasoning?: boolean;
    function_calling?: boolean;
    open_source?: boolean;
    sort: SortField;
    order: "asc" | "desc";
    limit: number;
    offset: number;
  },
  signal?: AbortSignal,
): Promise<ModelsResponse> {
  const q = new URLSearchParams();
  q.set("category", params.category);
  if (params.search) q.set("search", params.search);
  if (params.provider) q.set("provider", params.provider);
  if (params.vision) q.set("vision", "true");
  if (params.reasoning) q.set("reasoning", "true");
  if (params.function_calling) q.set("function_calling", "true");
  if (params.open_source) q.set("open_source", "true");
  q.set("sort", params.sort);
  q.set("order", params.order);
  q.set("limit", String(params.limit));
  q.set("offset", String(params.offset));
  return get<ModelsResponse>(`/api/models?${q}`, signal);
}

export function fetchEvents(
  limit = 50,
  category?: Category,
): Promise<EventsResponse> {
  const q = new URLSearchParams();
  q.set("limit", String(limit));
  if (category) q.set("category", category);
  return get<EventsResponse>(`/api/events?${q}`);
}

/** 启动后台采集，立即返回；进度通过 fetchRefreshStatus 轮询。 */
export function refresh(): Promise<RefreshStartResponse> {
  return fetch("/api/refresh", { method: "POST" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json() as Promise<RefreshStartResponse>;
  });
}

export function fetchRefreshStatus(): Promise<JobState> {
  return get<JobState>("/api/refresh");
}
