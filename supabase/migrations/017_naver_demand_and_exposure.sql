-- ============================================================
-- 네이버 검색 수요·노출 연동
--
-- 1) 질문별 대표 검색어와 네이버 월간 검색량 (keywords)
--    네이버 검색광고 API 키워드 도구로 받은 PC+모바일 월간 검색량입니다.
--    AI 추천 확률에 '실제 검색 수요' 가중치를 주는 데 씁니다.
-- 2) 병원 네이버 블로그 주소 (clients.naver_blog_url)
--    네이버 블로그 검색 결과에서 우리 블로그 글을 알아보는 데 씁니다.
-- 3) 네이버 노출 기록 (naver_results)
--    모니터링을 돌릴 때마다 같은 질문으로 네이버 플레이스(지역)·블로그·웹문서
--    검색 결과에서 우리 병원이 몇 위인지 남깁니다.
--
-- 실행 위치: Supabase 대시보드 > SQL Editor (전체를 한 번에 붙여넣고 Run)
-- 기존 데이터를 지우지 않습니다.
-- ============================================================

alter table keywords add column if not exists search_keyword text;
alter table keywords add column if not exists search_volume int;
alter table keywords add column if not exists search_volume_note text;
alter table keywords add column if not exists search_volume_checked_at timestamptz;

alter table clients add column if not exists naver_blog_url text;

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
create index if not exists idx_naver_results_run on naver_results(run_id);
create index if not exists idx_naver_results_keyword on naver_results(keyword_id);
alter table naver_results enable row level security;

notify pgrst, 'reload schema';
