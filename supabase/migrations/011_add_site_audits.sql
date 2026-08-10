-- 홈페이지 분석 결과 기록 (클라이언트별로 마지막 분석 결과를 불러오기 위함)
-- SQL Editor에서 실행하세요.

create table if not exists site_audits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  urls jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_site_audits_client on site_audits(client_id);
