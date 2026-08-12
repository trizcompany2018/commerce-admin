// src/MappingPage.jsx — 미매핑 상품 연결 화면 (엑셀 없이 클릭으로 매핑)
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const PLABEL = {
  naver: "네이버",
  coupang: "쿠팡",
  gmarket: "G마켓",
  auction: "옥션",
  "11st": "11번가",
};
const NEW = "__new__";
const parsePack = (name) => {
  const m = String(name || "").match(/(\d+)\s*개/);
  return m ? Number(m[1]) : 1;
};

export default function MappingPage() {
  const [listings, setListings] = useState([]);
  const [products, setProducts] = useState([]);
  const [drafts, setDrafts] = useState({}); // key -> {productId, pack, newName, newCost}
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const keyOf = (l) => l.platform + "|" + l.platform_product_id;

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [u, p] = await Promise.all([
        supabase
          .from("unmapped_listings")
          .select("platform,platform_product_id,listing_name")
          .limit(2000),
        supabase.from("products").select("id,name").order("name"),
      ]);
      if (u.error) throw u.error;
      if (p.error) throw p.error;
      setListings(u.data || []);
      setProducts(p.data || []);
      const d = {};
      (u.data || []).forEach((l) => {
        d[keyOf(l)] = {
          productId: "",
          pack: parsePack(l.listing_name),
          newName: "",
          newCost: "",
        };
      });
      setDrafts(d);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);

  const upd = (k, patch) =>
    setDrafts((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));

  async function saveRow(l) {
    const k = keyOf(l);
    const d = drafts[k];
    if (!d) return;
    const isNew = d.productId === NEW;
    if (!d.productId) {
      setErr("통합상품을 선택하세요.");
      return;
    }
    if (isNew && !d.newName.trim()) {
      setErr("새 상품명을 입력하세요.");
      return;
    }
    if (!d.pack || d.pack < 1) {
      setErr("개입수를 입력하세요.");
      return;
    }
    setSavingKey(k);
    setErr(null);
    setMsg(null);
    try {
      // 1) 상품 확보
      let pid = isNew ? null : Number(d.productId);
      if (isNew) {
        const { data, error } = await supabase
          .from("products")
          .insert({
            name: d.newName.trim(),
            base_unit_cost: d.newCost ? Number(d.newCost) : null,
          })
          .select("id")
          .single();
        if (error) throw error;
        pid = data.id;
      }
      // 2) 구성(개입수) 확보 (없으면 생성)
      const vname = `${d.pack}개입`;
      let vid;
      const vsel = await supabase
        .from("product_variants")
        .select("id")
        .eq("product_id", pid)
        .eq("variant_name", vname)
        .maybeSingle();
      if (vsel.error) throw vsel.error;
      if (vsel.data) vid = vsel.data.id;
      else {
        const { data, error } = await supabase
          .from("product_variants")
          .insert({ product_id: pid, variant_name: vname, pack_size: d.pack })
          .select("id")
          .single();
        if (error) throw error;
        vid = data.id;
      }
      // 3) 등록상품 연결
      const { error } = await supabase
        .from("platform_listings")
        .update({ variant_id: vid })
        .eq("platform", l.platform)
        .eq("platform_product_id", l.platform_product_id);
      if (error) throw error;

      setListings((prev) => prev.filter((x) => keyOf(x) !== k));
      setMsg(`연결 완료: ${l.listing_name || l.platform_product_id}`);
      if (isNew) load(); // 새 상품이 드롭다운에 반영되도록 상품목록 갱신
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <h1 style={S.h1}>미매핑 상품 연결</h1>
        <button onClick={load} disabled={loading} style={S.btnGhost}>
          {loading ? "불러오는 중…" : "새로고침"}
        </button>
      </div>
      <p style={S.sub}>
        업로드했지만 아직 상품에 연결 안 된 항목이에요. 통합상품·개입수를 고르고
        저장하면 대시보드에 바로 반영됩니다.
      </p>

      {err && <div style={S.err}>오류: {err}</div>}
      {msg && <div style={S.ok}>{msg}</div>}

      {!loading && listings.length === 0 && (
        <div style={S.empty}>미매핑 상품이 없어요. 모두 연결됨 ✓</div>
      )}

      {listings.length > 0 && (
        <div style={S.card}>
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  {[
                    "플랫폼",
                    "상품명(원본)",
                    "코드",
                    "통합상품",
                    "개입수",
                    "저장",
                  ].map((h) => (
                    <th key={h} style={S.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => {
                  const k = keyOf(l);
                  const d = drafts[k] || {};
                  const isNew = d.productId === NEW;
                  return (
                    <tr key={k}>
                      <td style={S.td}>{PLABEL[l.platform] || l.platform}</td>
                      <td style={S.td} title={l.listing_name}>
                        {(l.listing_name || "").slice(0, 40)}
                      </td>
                      <td style={S.tdm}>{l.platform_product_id}</td>
                      <td style={S.td}>
                        <select
                          value={d.productId}
                          onChange={(e) =>
                            upd(k, { productId: e.target.value })
                          }
                          style={S.sel}
                        >
                          <option value="">— 선택 —</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                          <option value={NEW}>+ 새 상품…</option>
                        </select>
                        {isNew && (
                          <div
                            style={{
                              marginTop: 6,
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            <input
                              placeholder="새 상품명"
                              value={d.newName}
                              onChange={(e) =>
                                upd(k, { newName: e.target.value })
                              }
                              style={S.inp}
                            />
                            <input
                              placeholder="1개입원가"
                              type="number"
                              value={d.newCost}
                              onChange={(e) =>
                                upd(k, { newCost: e.target.value })
                              }
                              style={{ ...S.inp, width: 100 }}
                            />
                          </div>
                        )}
                      </td>
                      <td style={S.td}>
                        <input
                          type="number"
                          min={1}
                          value={d.pack}
                          onChange={(e) =>
                            upd(k, { pack: Number(e.target.value) })
                          }
                          style={{ ...S.inp, width: 70 }}
                        />
                      </td>
                      <td style={S.td}>
                        <button
                          onClick={() => saveRow(l)}
                          disabled={savingKey === k}
                          style={S.btn}
                        >
                          {savingKey === k ? "…" : "저장"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: {
    maxWidth: 1000,
    margin: "24px auto",
    padding: "0 16px",
    fontFamily: "sans-serif",
    color: "#1c2330",
  },
  head: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  h1: { fontSize: 20, margin: "6px 0" },
  sub: { color: "#697386", fontSize: 13, marginBottom: 16 },
  err: {
    background: "#fdecec",
    color: "#c0392b",
    padding: "10px 14px",
    borderRadius: 8,
    marginBottom: 12,
  },
  ok: {
    background: "#e4f4ec",
    color: "#2e7d5b",
    padding: "10px 14px",
    borderRadius: 8,
    marginBottom: 12,
  },
  empty: {
    textAlign: "center",
    color: "#697386",
    padding: 40,
    background: "#fff",
    border: "1px solid #e3e8ef",
    borderRadius: 12,
  },
  card: {
    background: "#fff",
    border: "1px solid #e3e8ef",
    borderRadius: 12,
    padding: 12,
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 },
  th: {
    background: "#f2f5f9",
    color: "#48566a",
    fontWeight: 700,
    padding: "8px 10px",
    textAlign: "left",
    borderBottom: "1px solid #e3e8ef",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "8px 10px",
    borderBottom: "1px solid #eef1f5",
    verticalAlign: "top",
  },
  tdm: {
    padding: "8px 10px",
    borderBottom: "1px solid #eef1f5",
    fontFamily: "ui-monospace,monospace",
    fontSize: 11,
    color: "#48566a",
    whiteSpace: "nowrap",
  },
  sel: {
    padding: "6px 8px",
    borderRadius: 7,
    border: "1px solid #d5dbe4",
    fontSize: 12.5,
    minWidth: 180,
  },
  inp: {
    padding: "6px 8px",
    borderRadius: 7,
    border: "1px solid #d5dbe4",
    fontSize: 12.5,
  },
  btn: {
    padding: "7px 14px",
    borderRadius: 7,
    border: 0,
    background: "#3b6fd6",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  btnGhost: {
    padding: "7px 14px",
    borderRadius: 7,
    border: "1px solid #d5dbe4",
    background: "#fff",
    color: "#3b6fd6",
    fontWeight: 700,
    cursor: "pointer",
  },
};
