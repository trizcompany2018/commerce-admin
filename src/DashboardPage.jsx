// src/DashboardPage.jsx
//   설치 필요: npm install recharts
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// 전체(정확) 금액
const won = (n) => Math.round(n || 0).toLocaleString("ko-KR") + "원";
// 압축 금액 (만/억) — 폭 넘침 방지
const wonC = (n) => {
  n = Math.round(n || 0);
  const a = Math.abs(n);
  if (a >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, "") + "억";
  if (a >= 1e4) return Math.round(n / 1e4).toLocaleString("ko-KR") + "만";
  return n.toLocaleString("ko-KR");
};
const man = (v) => (v / 10000).toFixed(0) + "만";

// 'YYYY-MM' → [시작일, 다음달1일)
function monthBounds(m) {
  const [y, mm] = m.split("-").map(Number);
  const start = `${m}-01`;
  const next =
    mm === 12 ? `${y + 1}-01-01` : `${y}-${String(mm + 1).padStart(2, "0")}-01`;
  return [start, next];
}
const ymMonth = (d) => d.toISOString().slice(0, 7);

const GROUP = {
  naver: "네이버",
  coupang: "쿠팡",
  gmarket: "G마켓·옥션",
  auction: "G마켓·옥션",
  "11st": "11번가",
};
const GROUP_ORDER = ["네이버", "쿠팡", "G마켓·옥션", "11번가"];
// 플랫폼별 브랜드 색 (구분 명확)
const GCOLOR = {
  네이버: "#03c75a",
  쿠팡: "#d73227",
  "G마켓·옥션": "#0588ee",
  "11번가": "#ff5a2e",
};
// 런던 지하철(튜브 라인) 팔레트 — 차트 배색용
const TUBE = {
  navy: "#0019a8",
  red: "#da291c",
  yellow: "#ffce00",
  green: "#007a33",
  pink: "#f4a9be",
  grey: "#a1a5a7",
  magenta: "#9a0058",
  blue: "#0098d8",
  turq: "#93ceba",
  purple: "#9364cc",
  orange: "#ef7b10",
  teal: "#00afad",
  brightgreen: "#00bd19",
  brown: "#b26332",
};
const groupOf = (p) => GROUP[p] || p || "기타";

const PLATFORMS = [
  { v: "all", l: "전체" },
  { v: "naver", l: "네이버" },
  { v: "coupang", l: "쿠팡" },
  { v: "gmarket", l: "G마켓" },
  { v: "auction", l: "옥션" },
  { v: "11st", l: "11번가" },
];

// Supabase Max rows(기본 1000) 우회 — 1000행씩 끝까지 가져옴
//   makeQuery: 매 호출마다 '새' 쿼리빌더를 반환하는 함수 (order 포함 권장)
async function fetchAll(makeQuery) {
  const PAGE = 1000;
  let out = [],
    start = 0;
  for (;;) {
    const { data, error } = await makeQuery().range(start, start + PAGE - 1);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < PAGE) break;
    start += PAGE;
  }
  return out;
}

// 섹션 그룹 플래그 (기본: 전부)
//   financial   = 스냅샷·KPI·플랫폼실적·일별추이·일별플랫폼·월별비교·누적
//   costWeekday = 비용구조·요일별
//   products    = 상품순위·개입수·구성유형·혼합세트·낱개실수요
//   detail      = 주문 상세내역
const ALL = { financial: 1, costWeekday: 1, products: 1, detail: 1 };

export default function DashboardPage({
  brand = null,
  show = ALL,
  title = "대시보드",
}) {
  const today = new Date().toISOString().slice(0, 10);
  const twoAgo = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    return d.toISOString().slice(0, 10);
  })();
  const [from, setFrom] = useState(twoAgo); // 기본: 최근 2개월
  const [to, setTo] = useState(today);
  const [platform, setPlatform] = useState("all");
  const [chartPlat, setChartPlat] = useState("all"); // 선차트 전용 플랫폼 필터
  const [prodMetric, setProdMetric] = useState("매출"); // 상품별 순위 기준: 매출 | 수량
  const [rows, setRows] = useState([]);
  const [prods, setProds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  // 월 비교 섹션
  const nowM = new Date();
  const prevM = new Date(nowM.getFullYear(), nowM.getMonth() - 1, 1);
  const [baseMonth, setBaseMonth] = useState(ymMonth(prevM));
  const [compMonth, setCompMonth] = useState(ymMonth(nowM));
  const [monthData, setMonthData] = useState([]);
  const [mLoading, setMLoading] = useState(false);
  const [summary, setSummary] = useState(null); // 전일/금주/금달 스냅샷
  const [demand, setDemand] = useState([]); // 낱개 구성품 수요(세트 펼침)
  const [saleCfg, setSaleCfg] = useState([]); // 구성유형 분류(주문라인)
  const [cfgMetric, setCfgMetric] = useState("수량"); // 구성유형 기준: 건수 | 수량 | 매출
  const Z = {
    cust: 0,
    cnt: 0,
    qty: 0,
    sales: 0,
    settlement: 0,
    cost: 0,
    courier: 0,
    net: 0,
  };
  const [agg, setAgg] = useState(Z); // 상단 KPI = DB 집계(RPC) 결과

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      // ① 상단 KPI = DB 집계(RPC) 한 줄 (브랜드 필터)
      const { data: aggData, error: aggErr } = await supabase.rpc(
        "dashboard_summary",
        {
          p_from: from,
          p_to: to,
          p_platform: platform === "all" ? null : platform,
          p_brand: brand,
        },
      );
      if (aggErr) throw aggErr;
      const a = (aggData && aggData[0]) || {};
      setAgg({
        cust: Number(a.cust || 0),
        cnt: Number(a.cnt || 0),
        qty: Number(a.qty || 0),
        sales: Number(a.sales || 0),
        settlement: Number(a.settlement || 0),
        cost: Number(a.cost || 0),
        courier: Number(a.courier || 0),
        net: Number(a.net || 0),
      });

      // ② 차트·상세표용 행 (섹션에 필요한 것만 fetch → 로딩 개선). 브랜드 필터 포함
      const q = (tbl, cols, extra) => () => {
        let b = supabase
          .from(tbl)
          .select(cols)
          .gte("payment_date", from)
          .lte("payment_date", to);
        if (extra) b = extra(b);
        if (platform !== "all") b = b.eq("platform", platform);
        if (brand) b = b.eq("brand", brand);
        return b;
      };
      const needRows = show.financial || show.costWeekday || show.detail;
      setRows(
        needRows
          ? await fetchAll(
              q(
                "settlement_line",
                "payment_date,platform,order_id,product_order_id,tracking_no,listing_name,product_display,quantity,gross_sales,settlement_amount,courier_cost,product_cost,net_profit",
                (b) =>
                  b
                    .order("payment_date", { ascending: true })
                    .order("product_order_id", { ascending: true }),
              ),
            )
          : [],
      );
      setProds(
        show.products
          ? await fetchAll(
              q(
                "sales_enriched",
                "product_name,variant_name,pack_size,quantity,unit_qty,settlement_amount,platform,payment_date",
                (b) =>
                  b
                    .not("product_id", "is", null)
                    .order("payment_date", { ascending: true }),
              ),
            )
          : [],
      );
      setDemand(
        show.products
          ? await fetchAll(
              q(
                "component_demand_by_product",
                "product_name,platform,payment_date,total_units",
                (b) => b.order("payment_date", { ascending: true }),
              ),
            )
          : [],
      );
      setSaleCfg(
        show.products
          ? await fetchAll(
              q(
                "sale_config",
                "platform,payment_date,config_type,config_name,quantity,settlement_amount,total_pieces",
                (b) => b.order("payment_date", { ascending: true }),
              ),
            )
          : [],
      );
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }
  async function loadMonthly() {
    setMLoading(true);
    setErr(null);
    try {
      const fetchMonth = async (m) => {
        const [s, e] = monthBounds(m);
        return fetchAll(() => {
          let b = supabase
            .from("settlement_line")
            .select("payment_date,gross_sales,brand")
            .gte("payment_date", s)
            .lt("payment_date", e)
            .order("payment_date", { ascending: true });
          if (brand) b = b.eq("brand", brand);
          return b;
        });
      };
      const [b, c] = await Promise.all([
        fetchMonth(baseMonth),
        fetchMonth(compMonth),
      ]);
      const days = {};
      for (let d = 1; d <= 31; d++) days[d] = { day: d, base: 0, comp: 0 };
      b.forEach((r) => {
        const d = Number(String(r.payment_date).slice(8, 10));
        if (days[d]) days[d].base += Number(r.gross_sales || 0);
      });
      c.forEach((r) => {
        const d = Number(String(r.payment_date).slice(8, 10));
        if (days[d]) days[d].comp += Number(r.gross_sales || 0);
      });
      setMonthData(Object.values(days));
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setMLoading(false);
    }
  }

  async function loadSummary() {
    try {
      const now = new Date();
      const iso = (dt) => {
        const t = new Date(dt);
        return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
      };
      const slash = (s) => s.split("-").join("/"); // 2026-08-09 → 2026/08/09
      const md = (s) => {
        const p = s.split("-");
        return `${p[1]}/${p[2]}`;
      }; // → 08/15
      const todayS = iso(now);
      // 롤링 윈도우 (모두 오늘 제외 = 어제까지). 주초/월초 튐 없음.
      const addDays = (s, n) => {
        const d = new Date(s);
        d.setDate(d.getDate() + n);
        return iso(d);
      };
      const yS = addDays(todayS, -1); // 하루 전(어제)
      const w7S = addDays(todayS, -7),
        w7E = yS; // 최근 7일 (어제까지)
      const w30S = addDays(todayS, -30),
        w30E = yS; // 최근 30일 (어제까지)
      // 직전 동일 길이 구간
      const y2S = addDays(todayS, -2); // 그 전날(하루)
      const p7S = addDays(todayS, -14),
        p7E = addDays(todayS, -8); // 직전 7일
      const p30S = addDays(todayS, -60),
        p30E = addDays(todayS, -31); // 직전 30일

      const call = async (s, e) => {
        const { data, error } = await supabase.rpc("dashboard_summary", {
          p_from: s,
          p_to: e,
          p_platform: null,
          p_brand: brand,
        });
        if (error) throw error;
        const r = (data && data[0]) || {};
        return {
          cust: Number(r.cust || 0),
          cnt: Number(r.cnt || 0),
          sales: Number(r.sales || 0),
        };
      };
      const [d1, d2, d3, pp1, pp2, pp3] = await Promise.all([
        call(yS, yS),
        call(w7S, w7E),
        call(w30S, w30E),
        call(y2S, y2S),
        call(p7S, p7E),
        call(p30S, p30E),
      ]);
      setSummary([
        {
          label: "하루 전",
          range: slash(yS),
          ...d1,
          prevSales: pp1.sales,
          prevLabel: "그 전날",
        },
        {
          label: "최근 7일",
          range: `${slash(w7S)} ~ ${md(w7E)}`,
          ...d2,
          prevSales: pp2.sales,
          prevLabel: "직전 7일",
        },
        {
          label: "최근 한 달",
          range: `${slash(w30S)} ~ ${md(w30E)}`,
          ...d3,
          prevSales: pp3.sales,
          prevLabel: "직전 30일",
        },
      ]);
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  useEffect(() => {
    load();
    if (show.financial) {
      loadMonthly();
      loadSummary();
    }
    /* eslint-disable-next-line */
  }, []);

  // KPI 는 DB 집계(agg) 사용 — 행수와 무관하게 정확·즉시
  const kpi = agg;
  const customerCount = agg.cust; // 결제고객수 (distinct 주문)
  const lineCount = agg.cnt; // 결제건수 (상품주문 라인)
  const margin = kpi.sales > 0 ? (kpi.net / kpi.sales) * 100 : 0;

  // 플랫폼별 집계
  const pmap = {};
  rows.forEach((r) => {
    const g = groupOf(r.platform);
    pmap[g] = pmap[g] || {
      group: g,
      매출: 0,
      정산금액: 0,
      배송비: 0,
      원가: 0,
      순이익: 0,
      orders: new Set(),
    };
    pmap[g].매출 += Number(r.gross_sales || 0);
    pmap[g].정산금액 += Number(r.settlement_amount || 0);
    pmap[g].배송비 += Number(r.courier_cost || 0);
    pmap[g].원가 += Number(r.product_cost || 0);
    pmap[g].순이익 += Number(r.net_profit || 0);
    pmap[g].orders.add(r.platform + r.order_id);
  });
  const platformRows = Object.values(pmap)
    .map((x) => ({ ...x, 주문수: x.orders.size }))
    .sort(
      (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
    );

  // 일별 추이 (선차트 전용 플랫폼 필터 적용) — 매출 + 주문수
  const cRows =
    chartPlat === "all"
      ? rows
      : rows.filter((r) => groupOf(r.platform) === chartPlat);
  const dmap = {};
  cRows.forEach((r) => {
    const d = r.payment_date;
    if (!d) return;
    dmap[d] = dmap[d] || { date: d, 매출: 0, _o: new Set() };
    dmap[d].매출 += Number(r.gross_sales || 0);
    dmap[d]._o.add(r.platform + r.order_id);
  });
  const byDate = Object.values(dmap)
    .map((x) => ({ date: x.date, 매출: x.매출, 주문수: x._o.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 일별 플랫폼 매출 (스택 바) — 상단 필터가 '전체'가 아니면 그 플랫폼만
  const smap = {};
  rows.forEach((r) => {
    const d = r.payment_date;
    if (!d) return;
    smap[d] = smap[d] || { date: d };
    const g = groupOf(r.platform);
    smap[d][g] = (smap[d][g] || 0) + Number(r.gross_sales || 0);
  });
  const stackData = Object.values(smap).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  // 두 선이 겹치지 않게 축 배율 분리: 주문수 축을 넉넉히 잡아 아래쪽에 깔림
  const maxSales = Math.max(1, ...byDate.map((d) => d.매출));
  const maxOrders = Math.max(1, ...byDate.map((d) => d.주문수));

  // 상세표 배송비: 같은 송장은 '첫 라인'에만 부과, 나머지는 공란
  const parcelByTrack = {},
    firstIdxByTrack = {};
  rows.forEach((r, i) => {
    const t = r.tracking_no || "_n" + i;
    parcelByTrack[t] = (parcelByTrack[t] || 0) + Number(r.courier_cost || 0);
    if (firstIdxByTrack[t] === undefined) firstIdxByTrack[t] = i;
  });

  // 상품별 순위 (매출/수량 전환)
  const topProducts = Object.values(
    prods.reduce((m, r) => {
      const k = r.product_name || "(미매핑)";
      m[k] = m[k] || { name: k, 매출: 0, 수량: 0 };
      m[k].매출 += Number(r.settlement_amount || 0);
      m[k].수량 += Number(r.quantity || 0);
      return m;
    }, {}),
  )
    .sort((a, b) => b[prodMetric] - a[prodMetric])
    .slice(0, 10);

  // 개입수별 판매 수량 (세트/옵션 포함 — 1개 구매당 실제 낱개수로 버킷)
  //   스타터팩→9개입, 6팩→6개입, 10+1→10개입, 3종믹스→20개입, 낱개→pack_size
  const byPack = Object.values(
    saleCfg.reduce((m, r) => {
      const q = Number(r.quantity || 0);
      if (q <= 0) return m;
      const per = Math.round(Number(r.total_pieces || 0) / q); // 1건당 낱개수 = 개입수
      if (!per) return m;
      const k = `${per}개입`;
      m[k] = m[k] || { pack: k, ps: per, 수량: 0 };
      m[k].수량 += q;
      return m;
    }, {}),
  ).sort((a, b) => b.수량 - a.수량);

  // 낱개 구성품 수요 (세트/옵션 전부 낱개로 펼친 실수요) — 상위 12
  const demandTop = Object.values(
    demand.reduce((m, r) => {
      const k = r.product_name || "(기타)";
      m[k] = m[k] || { name: k, 낱개수량: 0 };
      m[k].낱개수량 += Number(r.total_units || 0);
      return m;
    }, {}),
  )
    .sort((a, b) => b.낱개수량 - a.낱개수량)
    .slice(0, 12);

  // 구성유형별 판매 (단품 / 동일맛 멀티팩 / 혼합세트)
  const CFG_ORDER = ["혼합세트", "동일맛 멀티팩", "단품"];
  const CFG_COLOR = {
    혼합세트: TUBE.magenta,
    "동일맛 멀티팩": TUBE.orange,
    단품: TUBE.teal,
  };
  const cfgAgg = saleCfg.reduce((m, r) => {
    const k = r.config_type || "기타";
    m[k] = m[k] || { type: k, 건수: 0, 수량: 0, 매출: 0 };
    m[k].건수 += 1;
    m[k].수량 += Number(r.quantity || 0);
    m[k].매출 += Number(r.settlement_amount || 0);
    return m;
  }, {});
  const configRows = CFG_ORDER.map(
    (t) => cfgAgg[t] || { type: t, 건수: 0, 수량: 0, 매출: 0 },
  );

  // 혼합세트 안에서 인기 순위 — 상위 10
  const setTop = Object.values(
    saleCfg
      .filter((r) => r.config_type === "혼합세트")
      .reduce((m, r) => {
        const k = r.config_name || "(기타)";
        m[k] = m[k] || { name: k, 건수: 0, 수량: 0, 매출: 0 };
        m[k].건수 += 1;
        m[k].수량 += Number(r.quantity || 0);
        m[k].매출 += Number(r.settlement_amount || 0);
        return m;
      }, {}),
  )
    .sort((a, b) => b[cfgMetric] - a[cfgMetric])
    .slice(0, 10);

  // 비용 구조 (총매출 = 수수료 + 배송비 + 원가 + 순이익)
  const costParts = [
    { name: "순이익", value: Math.max(0, kpi.net), color: TUBE.green },
    { name: "제품원가", value: Math.max(0, kpi.cost), color: TUBE.grey },
    {
      name: "수수료",
      value: Math.max(0, kpi.sales - kpi.settlement),
      color: TUBE.purple,
    },
    { name: "배송비", value: Math.max(0, kpi.courier), color: TUBE.orange },
  ];

  // 요일별 매출 (일~토)
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const byWeekday = WD.map((l, i) => ({ label: l, 매출: 0 }));
  rows.forEach((r) => {
    if (!r.payment_date) return;
    const [y, m, d] = r.payment_date.split("-").map(Number);
    byWeekday[new Date(y, m - 1, d).getDay()].매출 += Number(
      r.gross_sales || 0,
    );
  });

  // 월별 누적 매출 (위 일별 데이터를 러닝 합계로 — 같은 월 선택에 자동 연동)
  const cumMonth = (() => {
    let ba = 0,
      ca = 0;
    return monthData.map((d) => {
      ba += Number(d.base || 0);
      ca += Number(d.comp || 0);
      return { day: d.day, base: ba, comp: ca };
    });
  })();

  return (
    <div style={S.wrap}>
      <h1 style={S.h1}>
        {title}{" "}
        <span
          style={{
            fontSize: 12,
            color: "#9a0058",
            fontWeight: 700,
            verticalAlign: "middle",
          }}
        >
          결제건수 {lineCount.toLocaleString("ko-KR")}건
        </span>
      </h1>

      {/* 오늘 기준 스냅샷 */}
      {show.financial && summary && (
        <div style={S.snap}>
          {summary.map((s) => (
            <div key={s.label} style={S.snapCard}>
              <div style={S.snapTitle}>
                <span>
                  {s.label} <span style={S.snapSub}>{s.range}</span>
                </span>
                <Delta
                  cur={s.sales}
                  prev={s.prevSales}
                  title={`${s.prevLabel} 대비`}
                />
              </div>
              <div style={S.snapRow}>
                <span style={S.snapLbl}>결제고객수</span>
                <span style={S.snapVal}>
                  {s.cust.toLocaleString("ko-KR")}명
                </span>
              </div>
              <div style={S.snapRow}>
                <span style={S.snapLbl}>결제건수</span>
                <span style={S.snapVal}>{s.cnt.toLocaleString("ko-KR")}건</span>
              </div>
              <div style={S.snapRow}>
                <span style={S.snapLbl}>매출</span>
                <span style={S.snapVal}>
                  <Amt n={s.sales} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={S.filters}>
        <span style={S.flabel}>기간</span>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={S.input}
        />
        <span>~</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={S.input}
        />
        <span style={S.flabel}>플랫폼</span>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          style={S.input}
        >
          {PLATFORMS.map((p) => (
            <option key={p.v} value={p.v}>
              {p.l}
            </option>
          ))}
        </select>
        <button onClick={load} disabled={loading} style={S.btn}>
          {loading ? "조회 중…" : "조회"}
        </button>
      </div>

      {err && <div style={S.err}>오류: {err}</div>}

      {show.financial && (
        <>
          {/* KPI 9종 */}
          <div style={S.kpis}>
            <Kpi
              label="결제고객수"
              value={customerCount.toLocaleString("ko-KR") + "명"}
            />
            <Kpi
              label="결제건수"
              value={lineCount.toLocaleString("ko-KR") + "건"}
            />
            <Kpi
              label="결제상품수량"
              value={kpi.qty.toLocaleString("ko-KR") + "개"}
            />
            <Kpi label="총매출" value={<Amt n={kpi.sales} />} big />
            <Kpi label="정산금액" value={<Amt n={kpi.settlement} />} />
            <Kpi label="제품원가" value={<Amt n={kpi.cost} />} />
            <Kpi label="배송비" value={<Amt n={kpi.courier} />} />
            <Kpi
              label="순이익"
              value={<Amt n={kpi.net} />}
              big
              accent={kpi.net >= 0 ? "#007a33" : "#da291c"}
            />
            <Kpi
              label="이익률"
              value={margin.toFixed(1) + "%"}
              accent={margin >= 0 ? "#007a33" : "#da291c"}
            />
          </div>

          {/* 플랫폼별 실적 표 */}
          <div style={S.card}>
            <div style={S.ctitle}>플랫폼별 실적</div>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>플랫폼</th>
                  {["매출", "정산금액", "배송비", "원가", "순이익"].map((h) => (
                    <th key={h} style={S.thr}>
                      {h}
                    </th>
                  ))}
                  <th style={S.thc}>주문수</th>
                </tr>
              </thead>
              <tbody>
                {platformRows.map((r) => (
                  <tr key={r.group}>
                    <td style={S.td}>{r.group}</td>
                    <td style={S.tdr}>
                      <Amt n={r.매출} />
                    </td>
                    <td style={S.tdr}>
                      <Amt n={r.정산금액} />
                    </td>
                    <td style={S.tdr}>
                      <Amt n={r.배송비} />
                    </td>
                    <td style={S.tdr}>
                      <Amt n={r.원가} />
                    </td>
                    <td
                      style={{
                        ...S.tdr,
                        fontWeight: 700,
                        color: r.순이익 >= 0 ? "#007a33" : "#da291c",
                      }}
                    >
                      <Amt n={r.순이익} />
                    </td>
                    <td style={S.tdc}>{r.주문수}</td>
                  </tr>
                ))}
                {platformRows.length === 0 && (
                  <tr>
                    <td style={S.tdc} colSpan={7}>
                      데이터 없음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 일별 추이 — 매출 + 주문수, 플랫폼 선택 */}
          <div style={S.card}>
            <div style={S.crow}>
              <div style={S.ctitle}>일별 매출 · 주문수 추이</div>
              <select
                value={chartPlat}
                onChange={(e) => setChartPlat(e.target.value)}
                style={S.inputSm}
              >
                <option value="all">전체</option>
                {GROUP_ORDER.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={byDate}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis
                  yAxisId="l"
                  fontSize={11}
                  width={54}
                  tickFormatter={man}
                  domain={[0, Math.ceil(maxSales * 1.1)]}
                />
                <YAxis
                  yAxisId="r"
                  orientation="right"
                  fontSize={11}
                  width={40}
                  allowDecimals={false}
                  domain={[0, Math.ceil(maxOrders * 3)]}
                />
                <Tooltip
                  formatter={(v, name) =>
                    name === "주문수" ? v + "건" : won(v)
                  }
                />
                <Legend />
                <Line
                  yAxisId="l"
                  type="monotone"
                  dataKey="매출"
                  stroke="#0098d8"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="r"
                  type="monotone"
                  dataKey="주문수"
                  stroke="#ef7b10"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 일별 플랫폼 매출 (그룹 바 — 날짜별로 플랫폼 나란히) */}
          <div style={S.card}>
            <div style={S.ctitle}>일별 플랫폼 매출</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={stackData}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                barGap={1}
                barCategoryGap="18%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} width={54} tickFormatter={man} />
                <Tooltip formatter={(v) => won(v)} />
                <Legend />
                {GROUP_ORDER.map((g) => (
                  <Bar
                    key={g}
                    dataKey={g}
                    fill={GCOLOR[g]}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 월별 비교 (플랫폼 무관, 일자별 매출) */}
          <div style={S.card}>
            <div style={S.crow}>
              <div style={S.ctitle}>월별 매출 비교 (일자별)</div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span style={S.flabel}>기준월</span>
                <input
                  type="month"
                  value={baseMonth}
                  onChange={(e) => setBaseMonth(e.target.value)}
                  style={S.inputSm}
                />
                <span style={S.flabel}>비교월</span>
                <input
                  type="month"
                  value={compMonth}
                  onChange={(e) => setCompMonth(e.target.value)}
                  style={S.inputSm}
                />
                <button onClick={loadMonthly} disabled={mLoading} style={S.btn}>
                  {mLoading ? "조회 중…" : "비교"}
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={monthData}
                margin={{ top: 8, right: 16, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                <XAxis
                  dataKey="day"
                  fontSize={11}
                  tickFormatter={(d) => d + "일"}
                />
                <YAxis fontSize={11} width={54} tickFormatter={man} />
                <Tooltip
                  formatter={(v) => won(v)}
                  labelFormatter={(d) => d + "일"}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="base"
                  name={`기준월 ${baseMonth}`}
                  stroke="#00afad"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="comp"
                  name={`비교월 ${compMonth}`}
                  stroke="#da291c"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 월별 누적 매출 비교 (위 차트와 같은 월 선택에 연동) */}
          <div style={S.card}>
            <div style={S.ctitle}>월별 누적 매출 비교 (일자별 누적)</div>
            <div
              style={{ fontSize: 12, color: "#697386", margin: "4px 0 10px" }}
            >
              위 차트와 같은 기준월·비교월. 날이 갈수록 매출이 얼마나
              쌓이는지(러닝 합계)를 보여줘요.
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={cumMonth}
                margin={{ top: 8, right: 16, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                <XAxis
                  dataKey="day"
                  fontSize={11}
                  tickFormatter={(d) => d + "일"}
                />
                <YAxis fontSize={11} width={54} tickFormatter={man} />
                <Tooltip
                  formatter={(v) => won(v)}
                  labelFormatter={(d) => d + "일까지 누적"}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="base"
                  name={`기준월 ${baseMonth}`}
                  stroke="#00afad"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="comp"
                  name={`비교월 ${compMonth}`}
                  stroke="#da291c"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {show.products && (
        <>
          {/* 상품별 순위 (매출/수량 전환, 상품명 전체 표시) */}
          <div style={S.card}>
            <div style={S.crow}>
              <div style={S.ctitle}>상품별 판매 상위 10</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["매출", "수량"].map((mt) => (
                  <button
                    key={mt}
                    onClick={() => setProdMetric(mt)}
                    style={prodMetric === mt ? S.tabOn : S.tab}
                  >
                    {mt}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart
                data={topProducts}
                layout="vertical"
                margin={{ left: 8, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                <XAxis
                  type="number"
                  fontSize={11}
                  tickFormatter={prodMetric === "매출" ? man : (v) => v}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  fontSize={11}
                  width={210}
                  interval={0}
                />
                <Tooltip
                  formatter={(v) =>
                    prodMetric === "매출"
                      ? won(v)
                      : v.toLocaleString("ko-KR") + "개"
                  }
                />
                <Bar
                  dataKey={prodMetric}
                  fill="#0019a8"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 개입수별 판매 수량 (가로 막대) */}
          <div style={S.card}>
            <div style={S.ctitle}>개입수별 판매 수량 (세트 구성 포함)</div>
            <div
              style={{ fontSize: 12, color: "#697386", margin: "4px 0 10px" }}
            >
              1건 구매당 실제 낱개수로 집계. 세트도 실제 개입수로 잡혀요
              (스타터팩 9개입 · 6팩 6개입 · 10+1 10개입 · 3종믹스 20개입).
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={byPack}
                layout="vertical"
                margin={{ left: 8, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="pack"
                  fontSize={11}
                  width={70}
                  interval={0}
                />
                <Tooltip formatter={(v) => v.toLocaleString("ko-KR") + "개"} />
                <Bar
                  dataKey="수량"
                  fill="#b26332"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 구성유형별 판매 (단품 / 동일맛 멀티팩 / 혼합세트) */}
          <div style={S.card}>
            <div style={S.crow}>
              <div style={S.ctitle}>구성유형별 판매</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["건수", "수량", "매출"].map((mt) => (
                  <button
                    key={mt}
                    onClick={() => setCfgMetric(mt)}
                    style={cfgMetric === mt ? S.tabOn : S.tab}
                  >
                    {mt}
                  </button>
                ))}
              </div>
            </div>
            <div style={S.legend}>
              <div style={S.legRow}>
                <span style={{ ...S.dot, background: CFG_COLOR["혼합세트"] }} />
                <b>혼합세트</b> — 스타터팩, 6팩, 10+1 등 서로 다른 맛 묶음
              </div>
              <div style={S.legRow}>
                <span
                  style={{ ...S.dot, background: CFG_COLOR["동일맛 멀티팩"] }}
                />
                <b>동일맛 멀티팩</b> — 같은 맛 여러 개 (예: 아몬드 10개입)
              </div>
              <div style={S.legRow}>
                <span style={{ ...S.dot, background: CFG_COLOR["단품"] }} />
                <b>단품</b> — 낱개 1개 구입
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={configRows}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                <XAxis dataKey="type" fontSize={12} />
                <YAxis
                  fontSize={11}
                  width={54}
                  tickFormatter={cfgMetric === "매출" ? man : (v) => v}
                />
                <Tooltip
                  formatter={(v) =>
                    cfgMetric === "매출"
                      ? won(v)
                      : v.toLocaleString("ko-KR") +
                        (cfgMetric === "건수" ? "건" : "개")
                  }
                />
                <Bar dataKey={cfgMetric} radius={[4, 4, 0, 0]} maxBarSize={90}>
                  {configRows.map((e, i) => (
                    <Cell key={i} fill={CFG_COLOR[e.type] || "#0019a8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 혼합세트 인기 순위 */}
          <div style={S.card}>
            <div style={S.ctitle}>혼합세트 인기 순위 ({cfgMetric} 기준)</div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={setTop}
                layout="vertical"
                margin={{ left: 8, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                <XAxis
                  type="number"
                  fontSize={11}
                  tickFormatter={cfgMetric === "매출" ? man : (v) => v}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  fontSize={11}
                  width={200}
                  interval={0}
                />
                <Tooltip
                  formatter={(v) =>
                    cfgMetric === "매출"
                      ? won(v)
                      : v.toLocaleString("ko-KR") +
                        (cfgMetric === "건수" ? "건" : "개")
                  }
                />
                <Bar
                  dataKey={cfgMetric}
                  fill="#9a0058"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 낱개 구성품 실수요 (세트/옵션 펼침) */}
          <div style={S.card}>
            <div style={S.ctitle}>낱개 구성품 실수요 (세트·옵션 펼침)</div>
            <div style={{ fontSize: 12, color: "#697386", marginBottom: 10 }}>
              세트·멀티팩을 전부 낱개로 환산한 실물 수요. 생산·재고 판단용. (예:
              스타터팩 1개 → 아몬드1·오트1…군고구마1)
            </div>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart
                data={demandTop}
                layout="vertical"
                margin={{ left: 8, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  fontSize={11}
                  width={140}
                  interval={0}
                />
                <Tooltip formatter={(v) => v.toLocaleString("ko-KR") + "개"} />
                <Bar
                  dataKey="낱개수량"
                  fill="#007a33"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {show.costWeekday && (
        /* 비용 구조 + 요일별 매출 */
        <div style={S.row2}>
          <div style={{ ...S.card, flex: 1, marginBottom: 0 }}>
            <div style={S.ctitle}>비용 구조 (총매출 기준)</div>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={costParts}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {costParts.map((e, i) => (
                    <Cell key={i} fill={e.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => won(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ ...S.card, flex: 1.1, marginBottom: 0 }}>
            <div style={S.ctitle}>요일별 매출</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={byWeekday}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={11} width={54} tickFormatter={man} />
                <Tooltip formatter={(v) => won(v)} />
                <Bar
                  dataKey="매출"
                  fill="#9364cc"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={46}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 상세 내역 */}
      {show.detail && (
        <div style={S.card}>
          <div style={S.ctitle}>
            주문 상세 내역 ({rows.length.toLocaleString("ko-KR")}건)
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.thc}>넘버</th>
                  <th style={S.th}>플랫폼</th>
                  <th style={S.th}>주문번호</th>
                  <th style={S.th}>송장번호</th>
                  <th style={S.th}>제품</th>
                  <th style={S.thr}>주문금액</th>
                  <th style={S.thr}>정산예정금액</th>
                  <th style={S.thc}>수량</th>
                  <th style={S.thr}>공가</th>
                  <th style={S.thr}>배송비</th>
                  <th style={S.thr}>이익</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const t = r.tracking_no || "_n" + i;
                  const ship = firstIdxByTrack[t] === i ? parcelByTrack[t] : 0; // 첫 라인만 부과
                  const profit =
                    Number(r.settlement_amount || 0) -
                    ship -
                    Number(r.product_cost || 0);
                  return (
                    <tr
                      key={r.platform + r.order_id + i}
                      style={i % 2 ? S.trAlt : undefined}
                    >
                      <td style={S.tdc}>{i + 1}</td>
                      <td style={S.td}>{groupOf(r.platform)}</td>
                      <td style={S.tdm}>{r.order_id}</td>
                      <td style={S.tdm}>{r.tracking_no || "-"}</td>
                      <td style={S.td} title={r.listing_name}>
                        {r.product_display ||
                          (r.listing_name || "").slice(0, 24)}
                      </td>
                      <td style={S.tdr}>{won(r.gross_sales)}</td>
                      <td style={S.tdr}>{won(r.settlement_amount)}</td>
                      <td style={S.tdc}>{r.quantity}</td>
                      <td style={S.tdr}>{won(r.product_cost)}</td>
                      <td style={S.tdr}>{ship > 0 ? won(ship) : ""}</td>
                      <td
                        style={{
                          ...S.tdr,
                          fontWeight: 700,
                          color: profit >= 0 ? "#007a33" : "#da291c",
                        }}
                      >
                        {won(profit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={S.tfoot}>
                  <td style={S.tdc} colSpan={5}>
                    합계
                  </td>
                  <td style={S.tdr}>{won(kpi.sales)}</td>
                  <td style={S.tdr}>{won(kpi.settlement)}</td>
                  <td style={S.tdc}></td>
                  <td style={S.tdr}>{won(kpi.cost)}</td>
                  <td style={S.tdr}>{won(kpi.courier)}</td>
                  <td style={{ ...S.tdr, fontWeight: 700 }}>{won(kpi.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!loading &&
        !err &&
        (show.financial || show.costWeekday || show.detail) &&
        rows.length === 0 && (
          <div style={S.empty}>
            이 기간에 데이터가 없어요. 기간을 넓혀보세요.
          </div>
        )}
    </div>
  );
}

// 전기간 대비 % 배지 (초록↗ / 빨강↘ / 데이터없음 회색–). 튜브색 + 옅은 배경.
function Delta({ cur, prev, title }) {
  if (!prev || prev <= 0) {
    return (
      <span
        title={title}
        style={{
          ...S.delta,
          background: "rgba(161,165,167,0.18)",
          color: "#8a9092",
        }}
      >
        –
      </span>
    );
  }
  const pct = ((Number(cur || 0) - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span
      title={`${title || ""} (${up ? "+" : ""}${pct.toFixed(1)}%)`}
      style={{
        ...S.delta,
        background: up ? "rgba(0,122,51,0.13)" : "rgba(218,41,28,0.13)",
        color: up ? "#007a33" : "#da291c",
      }}
    >
      {Math.abs(pct).toFixed(0)}% {up ? "↗" : "↘"}
    </span>
  );
}

// 압축 금액 + 호버 시 정확한 금액(native title)
function Amt({ n }) {
  return (
    <span title={won(n)} style={{ cursor: "help" }}>
      {wonC(n)}
    </span>
  );
}

function Kpi({ label, value, accent, big }) {
  return (
    <div style={{ ...S.kpi, ...(big ? S.kpiBig : null) }}>
      <div style={S.klabel}>{label}</div>
      <div
        style={{
          ...S.kvalue,
          ...(big ? { fontSize: 22 } : null),
          color: accent || "#1c2330",
        }}
      >
        {value}
      </div>
    </div>
  );
}

const S = {
  wrap: {
    maxWidth: 1080,
    margin: "20px auto",
    padding: "0 16px",
    fontFamily: "sans-serif",
    color: "#1c2330",
    boxSizing: "border-box",
  },
  h1: { fontSize: 20, margin: "6px 0 14px" },
  filters: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  flabel: { fontSize: 13, fontWeight: 700, color: "#697386" },
  input: {
    padding: "7px 9px",
    borderRadius: 8,
    border: "1px solid #d5dbe4",
    fontSize: 13,
  },
  inputSm: {
    padding: "5px 8px",
    borderRadius: 7,
    border: "1px solid #d5dbe4",
    fontSize: 12.5,
  },
  btn: {
    padding: "7px 16px",
    borderRadius: 8,
    border: 0,
    background: "#0019a8",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  err: {
    background: "#fdecec",
    color: "#da291c",
    padding: "10px 14px",
    borderRadius: 8,
    marginBottom: 14,
  },
  snap: {
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: 12,
    marginBottom: 16,
  },
  snapCard: {
    background: "#F4FBFA",
    border: "1px solid #CDE6E1",
    borderRadius: 12,
    padding: "13px 16px",
  },
  snapTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0019a8",
    marginBottom: 8,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  snapSub: { fontSize: 11.5, fontWeight: 400, color: "#7A8A8E" },
  snapRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "3px 0",
  },
  snapLbl: { fontSize: 12.5, color: "#5B6B72" },
  snapVal: {
    fontSize: 15,
    fontWeight: 700,
    color: "#1c2330",
    display: "inline-flex",
    alignItems: "center",
  },
  delta: {
    fontSize: 11,
    fontWeight: 700,
    padding: "1px 6px",
    borderRadius: 6,
    whiteSpace: "nowrap",
    marginLeft: 6,
  },
  kpis: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(128px,1fr))",
    gap: 10,
    marginBottom: 16,
  },
  kpi: {
    background: "#fff",
    border: "1px solid #e3e8ef",
    borderRadius: 12,
    padding: "12px 12px",
    minWidth: 0,
  },
  kpiBig: { border: "2px solid #0019a8", background: "#f5f8ff" },
  klabel: {
    fontSize: 12,
    color: "#697386",
    marginBottom: 5,
    whiteSpace: "nowrap",
  },
  kvalue: {
    fontSize: 18,
    fontWeight: 700,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  card: {
    background: "#fff",
    border: "1px solid #e3e8ef",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    boxSizing: "border-box",
  },
  crow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  tab: {
    padding: "5px 13px",
    borderRadius: 7,
    border: "1px solid #d5dbe4",
    background: "#fff",
    color: "#5B6B72",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
  },
  tabOn: {
    padding: "5px 13px",
    borderRadius: 7,
    border: "1px solid #0019a8",
    background: "#0019a8",
    color: "#fff",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
  },
  ctitle: { fontSize: 15, fontWeight: 700 },
  legend: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    margin: "8px 0 12px",
    fontSize: 12.5,
    color: "#48566a",
  },
  legRow: { display: "flex", alignItems: "center", gap: 7 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    display: "inline-block",
    flexShrink: 0,
  },
  empty: { textAlign: "center", color: "#697386", padding: 30 },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12.5,
    whiteSpace: "nowrap",
  },
  th: {
    background: "#f2f5f9",
    color: "#48566a",
    fontWeight: 700,
    padding: "7px 9px",
    textAlign: "left",
    borderBottom: "1px solid #e3e8ef",
  },
  thr: {
    background: "#f2f5f9",
    color: "#48566a",
    fontWeight: 700,
    padding: "7px 9px",
    textAlign: "right",
    borderBottom: "1px solid #e3e8ef",
  },
  thc: {
    background: "#f2f5f9",
    color: "#48566a",
    fontWeight: 700,
    padding: "7px 9px",
    textAlign: "center",
    borderBottom: "1px solid #e3e8ef",
  },
  td: { padding: "6px 9px", borderBottom: "1px solid #eef1f5" },
  tdm: {
    padding: "6px 9px",
    borderBottom: "1px solid #eef1f5",
    fontFamily: "ui-monospace,monospace",
    fontSize: 11,
    color: "#48566a",
  },
  tdr: {
    padding: "6px 9px",
    borderBottom: "1px solid #eef1f5",
    textAlign: "right",
  },
  tdc: {
    padding: "6px 9px",
    borderBottom: "1px solid #eef1f5",
    textAlign: "center",
    color: "#697386",
  },
  trAlt: { background: "#fafbfc" },
  tfoot: { background: "#f2f5f9", fontWeight: 700 },
};
