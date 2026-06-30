import type {
  EventsResponse,
  ModelsResponse,
  RefreshResult,
  SortField,
} from "./types";

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`);
  return (await r.json()) as T;
}

export function fetchModels(params: {
  search?: string;
  provider?: string;
  vision?: boolean;
  sort: SortField;
  order: "asc" | "desc";
  limit: number;
  offset: number;
}): Promise<ModelsResponse> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.provider) q.set("provider", params.provider);
  if (params.vision) q.set("vision", "true");
  q.set("sort", params.sort);
  q.set("order", params.order);
  q.set("limit", String(params.limit));
  q.set("offset", String(params.offset));
  return get<ModelsResponse>(`/api/models?${q}`);
}

export function fetchEvents(limit = 50): Promise<EventsResponse> {
  return get<EventsResponse>(`/api/events?limit=${limit}`);
}

export function refresh(): Promise<RefreshResult> {
  return fetch("/api/refresh", { method: "POST" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json() as Promise<RefreshResult>;
  });
}
