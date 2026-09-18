import type { EventRow } from "../types";
import { fmtTime } from "../utils";
import { IconClock } from "./icons";

export default function EventFeed({ events }: { events: EventRow[] }) {
  if (events.length === 0) {
    return (
      <div className="events">
        <h2>近期变更</h2>
        <div className="empty">
          <IconClock size={20} />
          <div style={{ marginTop: 8 }}>
            暂无变更事件——下次采集检测到新模型或价格变动时会出现在这里。
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="events">
      <h2>近期变更</h2>
      {events.map((e, i) => {
        const cls =
          e.type === "new_model"
            ? "new"
            : e.type === "price_change"
              ? "price"
              : e.type === "deprecation"
                ? "deprecated"
                : "";
        return (
          <div
            key={e.id}
            className={`event ${cls}`}
            style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}
          >
            <div className="dot" />
            <div className="body">
              <div className="title">{e.title}</div>
              {e.before_value ? (
                <div className="change">
                  <span className="from">{e.before_value}</span>
                  {" → "}
                  <span className="to">{e.after_value}</span>
                </div>
              ) : e.after_value ? (
                <div className="change">{e.after_value}</div>
              ) : null}
            </div>
            <div className="time">{fmtTime(e.published_at)}</div>
          </div>
        );
      })}
    </div>
  );
}
