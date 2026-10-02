-- 콘텐츠 처방 저장 (질문별로 AI가 대신 추천한 곳·근거 페이지·만들 페이지 설계서)
-- 모니터링 실행마다 한 번 만들고, 화면과 리포트가 같이 쓴다.
-- 병원별 리포트에 넣을 항목 (AI 노출현황 · 경쟁분석 · 추이분석 · 홈페이지)
-- SQL Editor에서 실행하세요.

alter table clients add column if not exists report_sections jsonb not null
  default '["exposure", "competitors", "trends", "site"]'::jsonb;

create table if not exists content_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  run_id uuid references monitoring_runs(id) on delete set null,
  plan jsonb not null,
  cost_usd numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_content_plans_client on content_plans(client_id, created_at desc);

alter table content_plans enable row level security;

notify pgrst, 'reload schema';
