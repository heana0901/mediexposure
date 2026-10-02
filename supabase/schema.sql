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
  -- AI가 부를 수 있는 다른 이름(약칭·영문명·지점명). '노출' 판정 때 함께 찾는다
  aliases jsonb not null default '[]'::jsonb,
  -- 네이버 블로그 주소 (블로그 검색 결과에서 우리 글을 찾는 데 쓴다)
  naver_blog_url text,
  -- 자동 모니터링 주기(일). 비어 있으면 기본 주기(7일)
  monitor_interval_days smallint check (monitor_interval_days is null or monitor_interval_days between 1 and 60),
  created_at timestamptz not null default now()
);

create table if not exists keywords (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  -- 지운 질문은 실제로 삭제하지 않는다. 삭제하면 이 질문으로 쌓은 결과까지 사라진다.
  deleted_at timestamptz,
  -- 같은 의도의 다른 표현 (반복 측정 때 회차마다 돌려 가며 묻는다)과 지명 경고
  variants jsonb not null default '[]'::jsonb,
  variant_note text,
  -- 네이버 대표 검색어와 월간 검색량(PC+모바일, 검색광고 API)
  search_keyword text,
  search_volume int,
  search_volume_note text,
  search_volume_checked_at timestamptz
);

create index if not exists idx_keywords_client_active
  on keywords (client_id)
  where deleted_at is null;

create table if not exists monitoring_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- 측정 조건: 질문 방식(natural/list)과 기본 반복 횟수
  query_mode text,
  samples int,
  created_at timestamptz not null default now()
);

create table if not exists monitoring_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references monitoring_runs(id) on delete cascade,
  -- 질문이 지워져도 결과는 남긴다 (연결만 끊고, 문구는 keyword_text에 복사해 둔다)
  keyword_id uuid references keywords(id) on delete set null,
  keyword_text text,
  provider text not null constraint monitoring_results_provider_check
    check (provider in ('chatgpt', 'gemini', 'perplexity', 'claude')),
  -- 같은 질문을 같은 AI에 반복해서 물은 회차(0부터)
  sample_index int not null default 0,
  -- 이 회차에 실제로 보낸 표현과 '노출' 판정 근거 문장
  query_text text,
  evidence text,
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
  searched boolean,
  search_queries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 실행마다 같은 질문으로 본 네이버 노출 (플레이스·블로그·웹문서 순위)
create table if not exists naver_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references monitoring_runs(id) on delete cascade,
  keyword_id uuid references keywords(id) on delete set null,
  search_keyword text not null,
  local_rank int,
  local_total int not null default 0,
  blog_rank int,
  blog_own_count int not null default 0,
  blog_mention_count int not null default 0,
  blog_total int not null default 0,
  web_rank int,
  web_total int not null default 0,
  top_local jsonb not null default '[]'::jsonb,
  top_blogs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 건강보험심사평가원 병원정보 조회 결과 캐시 (경쟁 병원 실존 확인)
create table if not exists hospital_registry (
  name_key text primary key,
  query_name text not null,
  found boolean not null,
  official_name text,
  address text,
  checked_at timestamptz not null default now()
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
create index if not exists idx_naver_results_run on naver_results(run_id);
create index if not exists idx_naver_results_keyword on naver_results(keyword_id);
