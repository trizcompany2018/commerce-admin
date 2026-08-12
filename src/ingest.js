// src/ingest.js  — 엑셀 파싱·적재 (실제 네이버 정산 엑셀 컬럼 기준)
//   설치: npm install @supabase/supabase-js xlsx
import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';

// 엑셀 → 행 배열(JSON). 원본 컬럼명이 key
function readExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      resolve(XLSX.utils.sheet_to_json(ws, { defval: null }));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// 엑셀 → 2차원 배열 (헤더 위치가 유동적인 11번가용)
function readExcelMatrix(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      resolve(XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// 문자열/기호 섞인 숫자 → number
const num = (v) => (v == null || v === '' ? 0 : Number(String(v).replace(/[^0-9.-]/g, '')));
// 날짜 → 'YYYY-MM-DD'  (엑셀 날짜숫자/문자열 모두 처리, 시간대 안전)
const ymd = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);      // 엑셀 날짜 일련번호 → {y,m,d}
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return String(v).slice(0, 10);                 // 이미 'YYYY-MM-DD ...' 문자열인 경우
};

// 네이버 매핑키: '골라담기'는 맛이 옵션정보로 구분되므로 상품번호+옵션 복합키
function naverPid(r) {
  const id = r['상품번호'] ? String(r['상품번호']) : null;
  const opt = String(r['옵션정보'] ?? '').trim();
  if (id && opt && /골라담기/.test(String(r['상품명'] ?? ''))) return `${id}|${opt}`;
  return id;
}
function naverName(r) {
  const opt = String(r['옵션정보'] ?? '').trim();
  return opt && /골라담기/.test(String(r['상품명'] ?? ''))
    ? `${r['상품명']} - ${opt}` : (r['상품명'] ?? null);
}

// ============================================================
// 네이버 · 정산 엑셀  (실제 컬럼명 반영)
// ============================================================
export async function ingestNaver(file) {
  const rows = await readExcel(file);

  const items = rows
    .filter((r) => r['상품주문번호'])            // 빈/요약 행 제외
    .map((r) => ({
      platform: 'naver',
      product_order_id: String(r['상품주문번호']),           // 라인 PK
      order_id: String(r['주문번호'] ?? ''),
      tracking_no: r['송장번호'] ? String(r['송장번호']) : null,
      platform_product_id: naverPid(r),
      listing_name: naverName(r),
      option_info: r['옵션정보'] ?? null,
      quantity: num(r['수량']),
      // 주문금액 = 라인 실제 결제액(수량·할인 반영). 단가(상품가격)가 아님!
      price: num(r['최종 상품별 총 주문금액']),
      option_price: 0,
      raw: { 상품가격: r['상품가격'], 옵션가격: r['옵션가격'], 수량: r['수량'] },
      payment_date: ymd(r['결제일']),
      // 수수료는 음수로 들어옴 → 절댓값으로 저장
      fee_amount: Math.abs(num(r['네이버페이 주문관리 수수료']) + num(r['매출연동 수수료'])),
      settlement_amount: num(r['정산예정금액']),              // ← 실제 컬럼명
      line_type: 'item',
    }));

  await upsertItems(items);
  await registerListings(items);
  await supabase.rpc('generate_shipments');
  return { inserted: items.length };
}

// ============================================================
// 쿠팡 (실제 파일 받으면 컬럼명 최종 확인 예정 — 임시)
// ============================================================
// 네이버 · 주문(정산 확정 전) 엑셀 — 가계산
//   정산예정금액이 없으므로 주문금액에서 수수료(6.63%) 뗀 추정치로 채움.
//   나중에 '네이버 정산' 엑셀 올리면 같은 PK(상품주문번호)로 정확값 덮어씀.
// ============================================================
const NAVER_FEE_RATE = 0.0663;
export async function ingestNaverOrder(file) {
  const rows = await readExcel(file);
  const items = rows
    .filter((r) => r['상품주문번호'])
    .map((r) => {
      const gross = num(r['최종 상품별 총 주문금액']);           // 주문금액
      const settlement = Math.round(gross * (1 - NAVER_FEE_RATE)); // 추정 정산금액
      return {
        platform: 'naver',
        product_order_id: String(r['상품주문번호']),
        order_id: String(r['주문번호'] ?? ''),
        tracking_no: r['송장번호'] ? String(r['송장번호']) : null,
        platform_product_id: naverPid(r),
        listing_name: naverName(r),
        option_info: r['옵션정보'] ?? null,
        quantity: num(r['수량']),
        price: gross,
        option_price: 0,
        payment_date: ymd(r['결제일']),
        fee_amount: gross - settlement,
        settlement_amount: settlement,
        line_type: 'item',
        raw: { source: 'order_estimate' },
      };
    });
  await upsertItems(items);
  await registerListings(items);
  await supabase.rpc('generate_shipments');
  return { inserted: items.length };
}

// ============================================================
// 쿠팡 · 주문관리(DeliveryList) 엑셀
//   정산 엑셀 업로드 전 임시 데이터. 정산금액은 결제액에서 11.66% 수수료 뗀 추정치.
//   나중에 정산 엑셀을 올리면 같은 PK(주문번호-옵션ID)로 정확한 값 덮어씀.
const COUPANG_FEE_RATE = 0.1166;
export async function ingestCoupangOrder(file) {
  const rows = await readExcel(file);
  const items = rows
    .filter((r) => r['주문번호'] && r['옵션ID'])
    .map((r) => {
      const gross = num(r['결제액']);                          // 결제액 = 판매단가×수량
      const settlement = Math.round(gross * (1 - COUPANG_FEE_RATE)); // 추정 정산금액
      return {
        platform: 'coupang',
        product_order_id: `${r['주문번호']}-${r['옵션ID']}`,   // PK (안정적)
        order_id: String(r['주문번호']),
        tracking_no: r['운송장번호'] ? String(r['운송장번호']) : null,
        platform_product_id: String(r['옵션ID']),              // 매핑 키(팩=옵션 단위)
        listing_name: r['노출상품명(옵션명)'] ?? r['등록상품명'] ?? null,
        option_info: r['등록옵션명'] ?? null,                   // '50g 10개'
        quantity: num(r['구매수(수량)']),
        price: gross,                                           // 주문금액
        option_price: 0,
        payment_date: ymd(r['주문일']),
        fee_amount: gross - settlement,                        // 추정 수수료(11.66%)
        settlement_amount: settlement,                         // 추정 정산금액
        line_type: 'item',
        raw: { source: 'order_estimate', 결제액: gross, 배송비구분: r['배송비구분'], 노출상품ID: r['노출상품ID'] },
      };
    });
  await upsertItems(items);
  await registerListings(items);          // 옵션ID를 미매핑 등록상품으로 등록
  await supabase.rpc('generate_shipments'); // 운송장별 택배비 자동 생성
  return { inserted: items.length };
}

export async function ingestCoupangSettlement(file) {
  const rows = await readExcel(file);
  const items = rows
    .filter((r) => r['주문번호'])
    .map((r) => {
      const opt = String(r['옵션명'] ?? '');
      const isShipping = opt.includes('기본배송') || opt.includes('추가배송');
      if (isShipping) {
        return {
          platform: 'coupang',
          product_order_id: `${r['주문번호']}-SHIP-${opt}`,
          order_id: String(r['주문번호']),
          option_info: opt,
          settlement_amount: num(r['정산금액']),
          line_type: 'shipping_revenue',
        };
      }
      return {
        platform: 'coupang',
        product_order_id: `${r['주문번호']}-${r['옵션ID']}`,
        order_id: String(r['주문번호']),
        platform_product_id: r['상품ID'] ? String(r['상품ID']) : null,
        listing_name: r['상품명'] ?? null,
        option_info: opt,
        price: num(r['판매가']),
        quantity: num(r['판매수량']),
        fee_amount: Math.abs(num(r['수수료'])),
        settlement_amount: num(r['정산금액']),
        payment_date: ymd(r['결제완료일']),
        line_type: 'item',
      };
    });
  await upsertItems(items);
  await registerListings(items.filter((i) => i.platform_product_id));
  return { inserted: items.length };
}

// ============================================================
// 11번가 · 판매완료(정산) 엑셀 (.xls, 헤더가 상단 제목 아래에 있음)
//   옵션형 리스트 — 실제 상품은 '옵션'에 들어있어 상품번호+옵션 복합키로 매핑
//   금액: 주문금액=매출, 정산예정금액=정산(확정)
// ============================================================
export async function ingest11st(file) {
  const raw = await readExcelMatrix(file);
  const hi = raw.findIndex((r) => Array.isArray(r) && r.includes('주문번호') && r.includes('옵션'));
  if (hi < 0) throw new Error('11번가 헤더(주문번호/옵션)를 찾지 못했습니다.');
  const H = raw[hi];
  const g = (r, name) => { const i = H.indexOf(name); return i >= 0 ? r[i] : null; };
  const items = raw.slice(hi + 1)
    .filter((r) => Array.isArray(r) && g(r, '주문번호'))
    .map((r) => {
      const opt = String(g(r, '옵션') ?? '').trim();
      const pno = g(r, '상품번호') ? String(g(r, '상품번호')) : '';
      const gross = num(g(r, '주문금액'));
      const settle = num(g(r, '정산예정금액'));
      return {
        platform: '11st',
        product_order_id: `${g(r, '주문번호')}-${g(r, '주문상세번호') ?? 1}`,   // 라인 PK
        order_id: String(g(r, '주문번호')),
        tracking_no: g(r, '송장번호') ? String(g(r, '송장번호')) : null,
        platform_product_id: opt ? `${pno}|${opt}` : pno,                       // 옵션 복합키
        listing_name: opt ? `${g(r, '상품명') ?? ''} - ${opt}` : (g(r, '상품명') ?? null),
        option_info: opt || null,
        quantity: num(g(r, '수량')),
        price: gross,                                                           // 주문금액=매출
        option_price: 0,
        payment_date: ymd(g(r, '결제일시') ?? g(r, '주문일시')),
        fee_amount: Math.max(0, gross - settle),
        settlement_amount: settle,                                             // 정산예정금액=정산(확정)
        line_type: 'item',
      };
    });
  await upsertItems(items);
  await registerListings(items);
  await supabase.rpc('generate_shipments');
  return { inserted: items.length };
}

// ============================================================
// 공통 헬퍼
// ============================================================
async function upsertItems(items) {
  for (let i = 0; i < items.length; i += 500) {
    const chunk = items.slice(i, i + 500);
    const { error } = await supabase
      .from('order_items')
      .upsert(chunk, { onConflict: 'platform,product_order_id' });
    if (error) throw error;
  }
}

async function registerListings(items) {
  const seen = new Map();
  for (const it of items) {
    if (it.platform_product_id && !seen.has(it.platform_product_id))
      seen.set(it.platform_product_id, {
        platform: it.platform,
        platform_product_id: it.platform_product_id,
        listing_name: it.listing_name ?? null,
      });
  }
  if (seen.size === 0) return;
  const { error } = await supabase
    .from('platform_listings')
    .upsert([...seen.values()], {
      onConflict: 'platform,platform_product_id',
      ignoreDuplicates: true,
    });
  if (error) throw error;
}
