<div align="center">

# 📊 커머스 정산 관리 대시보드

**여러 오픈마켓의 판매·정산 엑셀을 한곳에 모아, 순이익까지 자동으로.**

네이버 · 쿠팡 · 11번가 · G마켓 · 옥션의 매출/수수료/택배비/원가를
자동 집계하고, 상품은 물론 **낱개 구성품 단위**까지 분석하는 셀프서비스 대시보드

<br>

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-0019A8?style=for-the-badge&logo=chartdotjs&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

</div>

<div align="center">

### 💡 정산 공식

**정산금액**﻿(배송비 수익 포함)　**−**　**택배비**﻿(송장 × 요율)　**−**　**제품원가**　**＝**　🟢 **순이익**

</div>

---

## ✨ 주요 기능

|     | 기능                    | 설명                                                          |
| :-: | ----------------------- | ------------------------------------------------------------- |
| 📥  | **멀티 플랫폼 업로드**  | 네이버·쿠팡·11번가·G마켓 엑셀을 플랫폼별 파서로 자동 파싱     |
| 🔗  | **상품 매핑**           | 등록상품/옵션 → 내부 상품·변형(개입수) 연결, 미매핑 자동 감지 |
| 🧩  | **BOM 구성 전개**       | 세트·옵션상품을 낱개 구성품으로 펼쳐 "맛별 실수요"까지 집계   |
| 💰  | **정산 계산**           | 송장별 택배비 배분, 유료배송 수익 반영, 라인·주문 단위 순이익 |
| 📈  | **인터랙티브 대시보드** | KPI·추이·순위·구성유형·비용구조 등 15+ 차트                   |
| 🔍  | **정합성 점검**         | 미매핑·오매핑·개입수 오류를 SQL로 셀프 검증                   |

<br>

> **🧩 BOM 전개란?**
> "올인원 9종 스타터팩 1개"를 사면 → 아몬드1·오트1·파래1…군고구마1 로 **낱개까지 펼쳐서** 집계합니다.
> 고정 세트 / 옵션 조합(6팩) / 옵션 맛선택(10+1) 을 4단 우선순위로 정확히 분해해요.

---

## 🖥️ 대시보드 구성

<table>
<tr>
<td>

**📌 상단 요약**

- 하루 전 / 최근 7일 / 최근 한 달
- 전기간 대비 증감 % 배지 (🟢↗ / 🔴↘)
- KPI 9종 (매출·정산·원가·순이익·이익률 …)

**📊 실적·추이**

- 플랫폼별 실적 표
- 일별 매출·주문수 추이
- 일별 플랫폼 매출 / 월별 비교(+누적)

</td>
<td>

**🏆 상품 분석**

- 상품별 판매 순위 (매출/수량)
- 개입수별 판매 수량
- 구성유형별 (단품 / 멀티팩 / 혼합세트)
- 낱개 구성품 실수요

**🎨 디자인**

- 플랫폼별 브랜드 컬러 구분

</td>
</tr>
</table>

---

## 🛠️ 기술 스택

| 구분            | 사용 기술                              |
| --------------- | -------------------------------------- |
| **프론트엔드**  | React · Vite · React Router · Recharts |
| **백엔드 / DB** | Supabase (PostgreSQL)                  |
| **엑셀 파싱**   | SheetJS (xlsx)                         |
| **배포**        | Vercel                                 |

---

## 📁 프로젝트 구조

```
src/
├── App.jsx            # 라우팅 (/dashboard · /upload · /mapping)
├── DashboardPage.jsx  # 대시보드 (차트 · KPI · 스냅샷)
├── UploadPage.jsx     # 엑셀 업로드
├── MappingPage.jsx    # 상품 연결
├── ingest.js          # 플랫폼별 파서 + DB 적재
└── supabaseClient.js  # Supabase 연결 (로컬=service / 배포=anon)
vercel.json            # SPA 라우팅
sql/                   # 스키마 · 매핑 · 집계 · 점검 쿼리
```

---

## 🚀 시작하기

### 1. 설치 & 실행

```bash
npm install
npm run dev
```

### 2. 환경변수 `.env` (git 제외)

```env
VITE_SUPABASE_URL=https://<프로젝트>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon 키>
VITE_SUPABASE_SERVICE_KEY=<service_role 키>   # 로컬 전용(쓰기). 배포엔 넣지 않음
```

### 3. DB 준비 (Supabase SQL Editor)

`sql/` 스크립트를 순서대로 실행 →
① 스키마 → ② 상품/플랫폼 매핑 → ③ BOM 레이어 → ④ 집계 함수 → ⑤ **RLS 보안 설정**

---

## 🔄 데이터 흐름

```
플랫폼 엑셀 ──▶ [ingest.js 파서] ──▶ order_items (주문 라인)
                                        │
      platform_listings ───────────────┤  상품코드/옵션 → 변형
      product_variants ────────────────┤  개입수(pack_size)
      products ────────────────────────┘  원가(base_unit_cost)
                                        │
        settlement_line / settlement_order ──▶ 순이익
        component_demand (BOM 전개)        ──▶ 낱개 구성품 수요
                                        │
                                   📊 대시보드
```

---

## ☁️ 배포 (Vercel)

1. GitHub에 push (`.env`는 `.gitignore`로 제외)
2. Vercel에서 저장소 Import → Framework **Vite** 자동 인식
3. 환경변수 **2개만** 등록 → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   > ⚠️ `service_role` 키는 넣지 않음 → 배포본은 **읽기 전용**
4. Deploy → 공개 링크 발급 · 이후 `git push` 시 **자동 재배포**

### 🔒 보안 모델

| 환경                 | 키           | 권한                   |
| -------------------- | ------------ | ---------------------- |
| **배포 (공개 링크)** | anon         | 🔍 조회만 (RLS 보호)   |
| **로컬 (관리자)**    | service_role | ✍️ 업로드·매핑 등 쓰기 |

> 모든 테이블 RLS 활성화 · anon은 SELECT만 허용 → 링크가 유출돼도 데이터 변경 불가

---

## 🧭 운영 루틴

```
1. 로컬 npm run dev  →  각 플랫폼 엑셀 업로드
2. 미매핑 뜨면       →  매핑 SQL로 연결
3. 정합성 점검       →  data_audit.sql · mapping_reconcile.sql
4. 화면/기능 수정    →  git push (자동 배포)
```

---

<div align="center">

내부 사용 프로젝트 · Private

</div>
