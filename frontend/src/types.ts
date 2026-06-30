export interface ModelRow {
  id: string;
  name: string;
  provider: string | null;
  context_length: number | null;
  modalities: string;
  supports_vision: number;
  supports_function_calling: number;
  supports_reasoning: number;
  open_source: number | null;
  release_date: string | null;
  input_per_mtok: number | null;
  output_per_mtok: number | null;
  cache_read_per_mtok: number | null;
  hf_downloads: number | null;
  hf_likes: number | null;
}

export interface ModelsResponse {
  items: ModelRow[];
  total: number;
  providers: string[];
}

export interface EventRow {
  id: number;
  type: string;
  model_id: string | null;
  title: string;
  before_value: string | null;
  after_value: string | null;
  published_at: string;
}

export interface EventsResponse {
  items: EventRow[];
}

export interface RefreshResult {
  models: number;
  new: number;
  price_changes: number;
  events: number;
}

export type SortField =
  | "name"
  | "provider"
  | "context_length"
  | "input_per_mtok"
  | "output_per_mtok"
  | "release_date"
  | "hf_downloads"
  | "hf_likes";
