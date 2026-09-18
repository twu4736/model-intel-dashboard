import type { ModelRow, SortField } from "../types";
import { fmtCtx, fmtPrice } from "../utils";

interface Props {
  rows: ModelRow[];
  sort: SortField;
  order: "asc" | "desc";
  onSort: (f: SortField) => void;
  /** 当前分类下的最大热度，用于热度条归一化 */
  maxHeat: number;
}

const COLUMNS: { key: SortField; label: string; title?: string }[] = [
  { key: "name", label: "模型" },
  { key: "provider", label: "厂商" },
  { key: "context_length", label: "上下文" },
  { key: "input_per_mtok", label: "输入价" },
  { key: "output_per_mtok", label: "输出价" },
  {
    key: "heat",
    label: "热度",
    title:
      "热度（HF 数据可达时）：log10(1+下载量)×2 + log10(1+点赞)\n" +
      "热度（HF 不可达时用代理）：开源 +3 + log10(1+上下文) + 多模态 +1.5\n" +
      "对数压缩平衡长尾分布；开源 = 社区可本地运行",
  },
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

function HeatCell({ value, maxHeat }: { value: number | null; maxHeat: number }) {
  if (value === null || value === undefined) {
    return <span className="muted">—</span>;
  }
  // 进度条相对当前分类最大热度归一化；最低给 4% 让小数字也有可见条
  const pct =
    maxHeat > 0
      ? Math.max(4, Math.min(100, (value / maxHeat) * 100))
      : 0;
  // 强度按数值分档：>70% 显示"🔥"暖色；>40% 紫；<40% 蓝
  const intensity = maxHeat > 0 ? value / maxHeat : 0;
  const heatClass =
    intensity > 0.7 ? "hot" : intensity > 0.4 ? "warm" : "cool";
  return (
    <div className="heat-cell" title={`热度 ${value.toFixed(2)}`}>
      <span className={`heat-num ${heatClass}`}>{value.toFixed(1)}</span>
      <span className="heat-track">
        <span className="heat-fill" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

export default function ModelTable({ rows, sort, order, onSort, maxHeat }: Props) {
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
                title={c.title}
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
              <td>
                <HeatCell value={m.heat} maxHeat={maxHeat} />
              </td>
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