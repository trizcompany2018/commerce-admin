// src/UploadPage.jsx
import { useState } from "react";
import {
  ingestNaver,
  ingestNaverOrder,
  ingestCoupangOrder,
  ingestCoupangSettlement,
  ingest11st,
  ingestGmarket,
} from "./ingest";

// 업로드 가능한 엑셀 종류 (플랫폼/파일별)
//   '주문/가정산' = 확정 전 추정, '정산(확정)' = 최종 정확값으로 덮어씀
const SOURCES = [
  { id: "naver-order", label: "네이버 · 주문(가정산)", fn: ingestNaverOrder },
  { id: "naver", label: "네이버 · 정산(확정)", fn: ingestNaver },
  {
    id: "coupang-order",
    label: "쿠팡 · 주문관리(가정산)",
    fn: ingestCoupangOrder,
  },
  {
    id: "coupang-settlement",
    label: "쿠팡 · 정산(확정)",
    fn: ingestCoupangSettlement,
  },
  { id: "11st", label: "11번가 · 판매완료(정산)", fn: ingest11st },
  { id: "gmarket", label: "G마켓 · 구매결정(정산예정)", fn: ingestGmarket },
];

export default function UploadPage() {
  const [sourceId, setSourceId] = useState("naver");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { type, msg }

  async function handleUpload() {
    if (!file) {
      setStatus({ type: "err", msg: "엑셀 파일을 먼저 선택하세요." });
      return;
    }
    const src = SOURCES.find((s) => s.id === sourceId);
    setBusy(true);
    setStatus({ type: "info", msg: "업로드 중…" });
    try {
      const res = await src.fn(file);
      setStatus({ type: "ok", msg: `완료 — ${res.inserted}건 저장됨` });
      setFile(null);
    } catch (e) {
      setStatus({ type: "err", msg: "오류: " + (e?.message ?? String(e)) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <h1 style={styles.h1}>엑셀 업로드</h1>
      <p style={styles.sub}>
        플랫폼과 엑셀 종류를 고르고 파일을 올리면 DB에 저장됩니다.
      </p>

      <label style={styles.label}>종류</label>
      <select
        value={sourceId}
        onChange={(e) => setSourceId(e.target.value)}
        style={styles.select}
      >
        {SOURCES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>

      <label style={styles.label}>파일</label>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        style={styles.file}
      />

      <button onClick={handleUpload} disabled={busy} style={styles.btn}>
        {busy ? "처리 중…" : "업로드"}
      </button>

      {status && (
        <div style={{ ...styles.status, ...statusColor(status.type) }}>
          {status.msg}
        </div>
      )}
    </div>
  );
}

function statusColor(type) {
  if (type === "ok") return { background: "#e4f4ec", color: "#2e7d5b" };
  if (type === "err") return { background: "#fdecec", color: "#c0392b" };
  return { background: "#eaf1fd", color: "#3b6fd6" };
}

const styles = {
  wrap: {
    maxWidth: 460,
    margin: "40px auto",
    padding: 24,
    fontFamily: "sans-serif",
  },
  h1: { fontSize: 22, margin: "0 0 4px" },
  sub: { color: "#697386", fontSize: 14, marginBottom: 24 },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 700,
    margin: "16px 0 6px",
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #d5dbe4",
  },
  file: { display: "block", width: "100%" },
  btn: {
    marginTop: 24,
    width: "100%",
    padding: "12px",
    borderRadius: 8,
    border: 0,
    background: "#3b6fd6",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  status: {
    marginTop: 16,
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 14,
  },
};
