-- MediExposure 대시보드 스키마
-- Supabase SQL Editor에서 이 파일 전체를 붙여넣고 실행하세요.

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_type text not null default 'hospital',
  region text,
  department text,
  director_name text,
  is_specialist boolean,
  contact_email text,
  website_url text,
  auto_report_enabled boolean not null default false,
  auto_report_day smallint,
  created_at timestamptz not null default now()
);

create table if not exists keywords (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists monitoring_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists monitoring_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references monitoring_runs(id) on delete cascade,
  keyword_id uuid not null references keywords(id) on delete cascade,
  provider text not null check (provider in ('chatgpt', 'gemini')),
  mentioned boolean not null default false,
  rank int,
  raw_response text,
  competitors jsonb not null default '[]'::jsonb,
  analysis_note text,
  model text,
  input_tokens int,
  output_tokens int,
  estimated_cost_usd numeric,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists user_clients (
  user_id uuid not null references app_users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  primary key (user_id, client_id)
);

create table if not exists site_audits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  urls jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_keywords_client on keywords(client_id);
create index if not exists idx_runs_client on monitoring_runs(client_id);
create index if not exists idx_results_run on monitoring_results(run_id);
create index if not exists idx_results_keyword on monitoring_results(keyword_id);
create index if not exists idx_site_audits_client on site_audits(client_id);
