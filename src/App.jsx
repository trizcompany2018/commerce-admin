// src/App.jsx  (기존 App.jsx 를 이 내용으로 교체)
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import UploadPage from "./UploadPage";
import DashboardPage from "./DashboardPage";
import MappingPage from "./MappingPage";
import ComponentSalesPage from "./ComponentSalesPage";

export default function App() {
  return (
    <BrowserRouter>
      <nav style={navStyle}>
        <Link to="/dashboard" style={linkStyle}>
          대시보드
        </Link>
        <Link to="/products" style={linkStyle}>
          제품별 판매
        </Link>
        <Link to="/upload" style={linkStyle}>
          업로드
        </Link>
        <Link to="/mapping" style={linkStyle}>
          상품 연결
        </Link>
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/products" element={<ComponentSalesPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/mapping" element={<MappingPage />} />
      </Routes>
    </BrowserRouter>
  );
}

const navStyle = {
  display: "flex",
  gap: 18,
  padding: "14px 24px",
  borderBottom: "1px solid #e3e8ef",
  fontFamily: "sans-serif",
};
const linkStyle = {
  textDecoration: "none",
  color: "#3b6fd6",
  fontWeight: 700,
  fontSize: 15,
};
