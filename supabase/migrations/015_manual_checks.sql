-- ============================================================
-- 실제 화면 비교: 사람이 실제 AI 앱에서 검색한 답변 기록
--
-- 직원이 ChatGPT·Gemini 등 실제 앱에서 질문을 검색하고 답변을 붙여넣으면,
-- 앱이 노출 여부·순위·경쟁 병원을 분석해 이 표에 저장합니다.
-- 같은 질문·같은 AI의 API 측정 결과와 비교해 API 측정이 실제 화면과 맞는지 확인하는 용도입니다.
-- (API 노출률 집계에는 섞이지 않습니다)
--
-- 실행 위치: Supabase 대시보드 > SQL Editor (전체를 한 번에 붙여넣고 Run)
-- 새 표를 만드는 안전한 변경입니다. 기존 데이터를 건드리지 않습니다.
-- ============================================================

create table if not exists manual_checks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- 질문이 지워져도 기록은 남긴다 (문구는 keyword_text에 복사)
  keyword_id uuid references keywords(id) on delete set null,
  keyword_text text not null,
  provider text not null check (provider in ('chatgpt', 'gemini', 'perplexity', 'claude')),
  raw_response text not null,
  mentioned boolean not null default false,
  rank int,
  competitors jsonb not null default '[]'::jsonb,
  -- 실제로 검색한 시각 (붙여넣은 시각과 다를 수 있다)
  checked_at timestamptz not null default now(),
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_manual_checks_client on manual_checks(client_id, checked_at desc);
