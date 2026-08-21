// src/App.jsx
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Outlet,
  Navigate,
} from "react-router-dom";
import UploadPage from "./UploadPage";
import DashboardPage from "./DashboardPage";
import MappingPage from "./MappingPage";
import ComponentSalesPage from "./ComponentSalesPage";

const linkStyleFn = ({ isActive }) => ({
  ...linkBase,
  ...(isActive ? linkActive : null),
});
const subLinkFn = ({ isActive }) => ({
  ...subLinkBase,
  ...(isActive ? subLinkActive : null),
});

// 전체 레이아웃 (상단 네비 + 콘텐츠)
function Shell() {
  return (
    <>
      <nav style={navStyle}>
        <NavLink to="/" end style={linkStyleFn}>
          전체 요약
        </NavLink>
        <NavLink to="/gutflex" style={linkStyleFn}>
          것플렉스
        </NavLink>
        <span style={{ flex: 1 }} />
        <NavLink to="/upload" style={linkStyleFn}>
          업로드
        </NavLink>
        <NavLink to="/mapping" style={linkStyleFn}>
          상품 연결
        </NavLink>
      </nav>
      <Outlet />
    </>
  );
}

// 것플렉스 서브 레이아웃 (서브 네비 + 콘텐츠)
function GutflexLayout() {
  return (
    <>
      <div style={subNavStyle}>
        <NavLink to="/gutflex" end style={subLinkFn}>
          요약
        </NavLink>
        <NavLink to="/gutflex/products" style={subLinkFn}>
          상품 분석
        </NavLink>
        <NavLink to="/gutflex/product-sales" style={subLinkFn}>
          제품별 판매
        </NavLink>
        <NavLink to="/gutflex/orders" style={subLinkFn}>
          주문 상세내역
        </NavLink>
      </div>
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Shell />}>
          {/* 전체 요약 (랜딩, 모든 브랜드) */}
          <Route
            index
            element={
              <DashboardPage
                key="all"
                brand={null}
                title="전체 요약"
                show={{ financial: 1 }}
              />
            }
          />

          {/* 것플렉스 섹션 */}
          <Route path="gutflex" element={<GutflexLayout />}>
            <Route
              index
              element={
                <DashboardPage
                  key="gf-sum"
                  brand="것플렉스"
                  title="것플렉스 · 요약"
                  show={{ financial: 1, costWeekday: 1 }}
                />
              }
            />
            <Route
              path="products"
              element={
                <DashboardPage
                  key="gf-prod"
                  brand="것플렉스"
                  title="것플렉스 · 상품 분석"
                  show={{ products: 1 }}
                />
              }
            />
            <Route
              path="product-sales"
              element={<ComponentSalesPage key="gf-psales" />}
            />
            <Route
              path="orders"
              element={
                <DashboardPage
                  key="gf-orders"
                  brand="것플렉스"
                  title="것플렉스 · 주문 상세내역"
                  show={{ detail: 1 }}
                />
              }
            />
          </Route>

          <Route path="upload" element={<UploadPage />} />
          <Route path="mapping" element={<MappingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

const navStyle = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  padding: "10px 24px",
  borderBottom: "1px solid #e3e8ef",
  fontFamily: "sans-serif",
  background: "#fff",
};
const linkBase = {
  textDecoration: "none",
  color: "#5B6B72",
  fontWeight: 700,
  fontSize: 14.5,
  padding: "7px 12px",
  borderRadius: 8,
};
const linkActive = { color: "#fff", background: "#0019a8" };

const subNavStyle = {
  display: "flex",
  gap: 4,
  alignItems: "center",
  padding: "8px 24px",
  borderBottom: "1px solid #eef1f5",
  fontFamily: "sans-serif",
  background: "#f7f9fc",
};
const subLinkBase = {
  textDecoration: "none",
  color: "#697386",
  fontWeight: 700,
  fontSize: 13,
  padding: "5px 11px",
  borderRadius: 7,
};
const subLinkActive = { color: "#0019a8", background: "#e6ebfa" };
