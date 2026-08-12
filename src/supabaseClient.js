// src/supabaseClient.js
// 로컬(내 컴퓨터)에서는 service_role 키가 있으면 그걸로 → 업로드(쓰기) 가능.
// 배포(Vercel)에서는 service 키를 안 넣으므로 anon 키로 → 읽기 전용(안전).
//   .env(로컬, git 제외):  VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_SERVICE_KEY
//   Vercel(배포):          VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY   (service 키는 넣지 말 것!)
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
const service = import.meta.env.VITE_SUPABASE_SERVICE_KEY; // 로컬 전용, 배포엔 없음

// service 키가 있으면(=로컬) 쓰기 가능, 없으면(=배포) anon 으로 읽기 전용
export const supabase = createClient(url, service || anon);

// 참고용: 지금 쓰기 권한이 있는 모드인지 (업로드 화면에서 안내문 등에 활용 가능)
export const canWrite = Boolean(service);
