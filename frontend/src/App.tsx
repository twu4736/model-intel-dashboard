import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import CategoryPage from "./components/CategoryPage";
import { CATEGORIES, DEFAULT_CATEGORY } from "./categories";

/** 路由壳：根路径重定向到默认分类，单段路径 :category 由 CategoryPage 自解析（非法值回退默认）。 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={CATEGORIES[DEFAULT_CATEGORY].path} replace />} />
        <Route path="/:category" element={<CategoryPage />} />
        {/* 深路径兜底回首页（防 SPA 直访 /xxx 时被路由吞成空白） */}
        <Route path="*" element={<Navigate to={CATEGORIES[DEFAULT_CATEGORY].path} replace />} />
      </Routes>
    </BrowserRouter>
  );
}