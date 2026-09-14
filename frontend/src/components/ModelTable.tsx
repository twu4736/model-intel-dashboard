import type { ModelRow, SortField } from "../types";
import { fmtCount, fmtCtx, fmtPrice } from "../utils";

interface Props {
  rows: ModelRow[];
  sort: SortField;
  order: "asc" | "desc";
  onSort: (f: SortField) => void;
}

const COLUMNS: { key: SortField; label: string }[] = [
  { key: "name", label: "模型" },
  { key: "provider", label: "厂商" },
  { key: "context_length", label: "上下文" },
  { key: "input_per_mtok", label: "输入价" },
  { key: "output_per_mtok", label: "输出价" },
  { key: "hf_downloads", label: "下载量" },
  { key: "hf_likes", label: "点赞" },
  { key: "release_date", label: "发布" },
];

function CapTags({ m }: { m: ModelRow }) {
  return (
    <span>
      {m.supports_vision ? <span className="tag vision">视觉</span> : null}
      {m.supports_reasoning ? <span className="tag reason">推理</span> : null}
      {m.supports_function_calling ? <span className="tag fc">工具</span> : null}
      {m.open_source === 1 ? <span className="tag on">开源</span> : null}
      {!m.supports_vision && !m.supports_reasoning && !m.supports_function_calling && m.open_source !== 1 ? (
        <span className="tag">文本</span>
      ) : null}
    </span>
  );
}

export default function ModelTable({ rows, sort, order, onSort }: Props) {
  const arrow = (f: SortField) => (sort === f ? (order === "asc" ? "▲" : "▼") : "");
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={sort === c.key ? "sorted" : ""}
                onClick={() => onSort(c.key)}
              >
                {c.label}
                <span className="arrow">{arrow(c.key)}</span>
              </th>
            ))}
            <th>能力</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td>
                <div style={{ fontWeight: 600 }} title={m.description ?? undefined}>
                  {m.name}
                </div>
                <div className="mono muted">{m.id}</div>
              </td>
              <td>{m.provider ?? "—"}</td>
              <td className="mono">{fmtCtx(m.context_length)}</td>
              <td className={m.input_per_mtok === 0 ? "free mono" : "mono"}>
                {fmtPrice(m.input_per_mtok)}
              </td>
              <td className={m.output_per_mtok === 0 ? "free mono" : "mono"}>
                {fmtPrice(m.output_per_mtok)}
              </td>
              <td className="mono">{fmtCount(m.hf_downloads)}</td>
              <td className="mono">{fmtCount(m.hf_likes)}</td>
              <td className="muted">{m.release_date ?? "—"}</td>
              <td>
                <CapTags m={m} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
