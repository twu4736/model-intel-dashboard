import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { CATEGORIES, type Category } from "../categories";
import { IconChat, IconEye, IconImage, IconMic, IconRadar } from "./icons";

const ICON_FOR: Record<Category, (p: { size?: number }) => React.ReactNode> = {
  llm: IconChat,
  multimodal: IconEye,
  image: IconImage,
  audio: IconMic,
};

export default function Layout({
  category,
  children,
}: {
  category: Category;
  children: ReactNode;
}) {
  const meta = CATEGORIES[category];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <IconRadar size={22} />
          </div>
          <div className="brand-text">
            <div className="brand-title">模型情报看板</div>
            <div className="brand-sub">Model Intelligence</div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="模型分类">
          <div className="nav-section-label">分类</div>
          {(Object.keys(CATEGORIES) as Category[]).map((k) => {
            const Icon = ICON_FOR[k];
            return (
              <NavLink
                key={k}
                to={CATEGORIES[k].path}
                className={({ isActive }) =>
                  "sidebar-link" + (isActive ? " active" : "")
                }
              >
                <span className="sidebar-icon">
                  <Icon size={17} />
                </span>
                <span className="sidebar-label">{CATEGORIES[k].label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="foot-row">
            <span className="dot" />
            OpenRouter · LiteLLM · HF
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="page-header">
          <div>
            <div className="page-eyebrow">{meta.label}</div>
            <h1 className="page-title">{meta.hint}</h1>
          </div>
          <div className="page-aside" />
        </header>
        <div className="page-body">{children}</div>
      </main>
    </div>
  );
}