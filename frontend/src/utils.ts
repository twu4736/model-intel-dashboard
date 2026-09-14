/** 显示用工具函数。 */

export function fmtPrice(v: number | null): string {
  if (v === null || v === undefined) return "—";
  if (v === 0) return "免费";
  if (v >= 100) return `$${Math.round(v)}`;
  if (v >= 1) return `$${v.toFixed(2).replace(/\.00$/, "")}`;
  // < 1：最多 4 位小数、去掉多余尾零，但至少保留 2 位（$0.10 而非 $0.1）
  return `$${v.toFixed(4).replace(/0{1,2}$/, "")}`;
}

export function fmtCtx(v: number | null): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return String(v);
}

/** 整数热度值（下载量/点赞）带 K/M 缩写。 */
export function fmtCount(v: number | null): string {
  if (v === null || v === undefined) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}K`;
  return String(v);
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return d.toLocaleString("zh-CN", { hour12: false });
}
