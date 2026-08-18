// src/ComponentSalesPage.jsx — 제품별(낱개 기준) 판매량·매출
//   "두부과자 아몬드가 낱개로 몇 개 팔렸나"를 세트/멀티팩까지 펼쳐서 집계.
//   DB 집계 함수 product_component_sales(p_from, p_to) 필요.
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const won = (n) => Math.round(n || 0).toLocaleString("ko-KR") + "원";
const num = (n) => Math.round(n || 0).toLocaleString("ko-KR");

// 기본 정렬 고정 순서 (없는 상품은 뒤에 매출순으로)
const ORDER = [
  "두부과자 아몬드",
  "두부과자 흑임자",
  "두부과자 현미",
  "두부과자 파래",
  "두부과자 오트",
  "프로틴클러스터 다크초코넛츠",
  "프로틴클러스터 아몬드크랜베리",
  "프로틴클러스터 검은콩멀티그레인",
  "고구마칩",
  "군고구마칩",
  "코스트코 유산균 푸룬주스",
  "애플사이다",
  "자몽얼그레이 콤부베이스",
  "두부스낵 6종 혼합",
  "두부스낵 5종 올인원",
  "프로틴클러스터 3종세트",
  "두부스낵 10+1(라이브특가)",
  "두부스낵 3종 믹스",
  "올인원 9종 스타터팩(신규)",
  "스타터팩",
  "두부스낵5종+클러스터3종 세트",
];
const orderIdx = (name) => {
  const i = ORDER.indexOf(name);
  return i < 0 ? 999 : i;
};

export default function ComponentSalesPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  })();
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [sort, setSort] = useState("기본"); // 기본 | 매출 | 판매량 | 단품
  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase.rpc("product_component_sales", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      setRows(
        (data || []).map((r) => ({
          name: r.product_name,
          매출: Number(r.revenue || 0),
          판매량: Number(r.sold || 0),
          단품: Number(r.pieces || 0),
        })),
      );
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);

  const sorted = [...rows].sort((a, b) => {
    if (sort === "기본") {
      const ia = orderIdx(a.name),
        ib = orderIdx(b.name);
      return ia !== ib ? ia - ib : b.매출 - a.매출; // 목록 밖은 매출순
    }
    return b[sort] - a[sort]; // 매출 | 판매량 | 단품
  });
  const total = rows.reduce(
    (a, r) => ({
      매출: a.매출 + r.매출,
      판매량: a.판매량 + r.판매량,
      단품: a.단품 + r.단품,
    }),
    { 매출: 0, 판매량: 0, 단품: 0 },
  );

  return (
    <div style={S.wrap}>
      <h1 style={S.h1}>제품별 판매 (낱개 기준)</h1>
      <p style={S.sub}>
        판매된 상품 그대로 집계해요. <b>세트는 별개 상품</b>(스타터팩 8팩 →
        판매량 8, 단품 72). 세트 속 구성품은 그 세트에 귀속돼 맛별 상품과 안
        섞여요(중복 없음). <b>판매량</b>=팩/건 수, <b>단품 판매량</b>=낱개 총
        개수.
      </p>

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
        <button onClick={() => load()} disabled={loading} style={S.btn}>
          {loading ? "조회 중…" : "조회"}
        </button>
        <span style={{ flex: 1 }} />
        <span style={S.flabel}>정렬</span>
        {["기본", "매출", "판매량", "단품"].map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            style={sort === s ? S.tabOn : S.tab}
          >
            {s === "기본" ? "기본" : s + "순"}
          </button>
        ))}
      </div>

      {err && <div style={S.err}>오류: {err}</div>}

      <div style={S.card}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.thc}>#</th>
              <th style={S.th}>제품명</th>
              <th style={S.thr}>총 매출</th>
              <th style={S.thr}>판매량</th>
              <th style={S.thr}>단품 판매량</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.name} style={i % 2 ? S.trAlt : undefined}>
                <td style={S.tdc}>{i + 1}</td>
                <td style={S.td}>{r.name}</td>
                <td style={S.tdr}>{won(r.매출)}</td>
                <td style={S.tdr}>{num(r.판매량)}개</td>
                <td style={S.tdr}>{num(r.단품)}개</td>
              </tr>
            ))}
            {sorted.length === 0 && !loading && (
              <tr>
                <td style={S.tdc} colSpan={5}>
                  데이터가 없어요. 기간을 넓혀보세요.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr style={S.tfoot}>
              <td style={S.tdc} colSpan={2}>
                합계
              </td>
              <td style={S.tdr}>{won(total.매출)}</td>
              <td style={S.tdr}>{num(total.판매량)}개</td>
              <td style={S.tdr}>{num(total.단품)}개</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

const S = {
  wrap: {
    maxWidth: 820,
    margin: "20px auto",
    padding: "0 16px",
    fontFamily: "sans-serif",
    color: "#1c2330",
  },
  h1: { fontSize: 20, margin: "6px 0 4px" },
  sub: { color: "#697386", fontSize: 13, marginBottom: 16 },
  filters: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 14,
  },
  flabel: { fontSize: 13, fontWeight: 700, color: "#697386" },
  input: {
    padding: "7px 9px",
    borderRadius: 8,
    border: "1px solid #d5dbe4",
    fontSize: 13,
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
  err: {
    background: "#fdecec",
    color: "#da291c",
    padding: "10px 14px",
    borderRadius: 8,
    marginBottom: 14,
  },
  card: {
    background: "#fff",
    border: "1px solid #e3e8ef",
    borderRadius: 12,
    padding: 8,
    boxSizing: "border-box",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    background: "#f2f5f9",
    color: "#48566a",
    fontWeight: 700,
    padding: "8px 10px",
    textAlign: "left",
    borderBottom: "1px solid #e3e8ef",
  },
  thr: {
    background: "#f2f5f9",
    color: "#48566a",
    fontWeight: 700,
    padding: "8px 10px",
    textAlign: "right",
    borderBottom: "1px solid #e3e8ef",
  },
  thc: {
    background: "#f2f5f9",
    color: "#48566a",
    fontWeight: 700,
    padding: "8px 10px",
    textAlign: "center",
    borderBottom: "1px solid #e3e8ef",
  },
  td: { padding: "7px 10px", borderBottom: "1px solid #eef1f5" },
  tdr: {
    padding: "7px 10px",
    borderBottom: "1px solid #eef1f5",
    textAlign: "right",
  },
  tdc: {
    padding: "7px 10px",
    borderBottom: "1px solid #eef1f5",
    textAlign: "center",
    color: "#697386",
  },
  trAlt: { background: "#fafbfc" },
  tfoot: { background: "#f2f5f9", fontWeight: 700 },
};
