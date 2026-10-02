-- ============================================================
-- 측정 신뢰도 보강
--
-- 1) 병원 별칭(clients.aliases)
--    AI가 "천안 엘츠의원"을 "엘츠의원"으로 부르는 것처럼 이름이 달라질 수 있어,
--    '노출'을 글자로 확인할 때 함께 찾을 이름을 등록합니다.
-- 2) 질문 표현(keywords.variants · variant_note)
--    같은 의도의 다른 표현을 저장해 반복 측정 때 회차마다 돌려 가며 묻습니다.
--    variant_note는 "화정역은 고양시와 광주광역시에 모두 있습니다" 같은 지명 경고입니다.
-- 3) 측정 조건(monitoring_runs.query_mode · samples)
--    질문 방식·반복 횟수가 바뀐 시점을 추이 그래프에 표시하기 위해 남깁니다.
-- 4) 판정 근거(monitoring_results.evidence · query_text)
--    '노출'로 본 문장과, 그 회차에 실제로 보낸 표현을 남깁니다.
-- 5) 병원 실존 확인 캐시(hospital_registry)
--    건강보험심사평가원 병원정보 조회 결과를 30일간 보관합니다.
-- 6) 재판정 전 백업(monitoring_results_judgement_backup_016)
--    과거 기록을 새 판정 규칙으로 다시 매기기 전에 기존 판정값을 복사해 둡니다.
--
-- 실행 위치: Supabase 대시보드 > SQL Editor (전체를 한 번에 붙여넣고 Run)
-- 기존 데이터를 지우지 않습니다.
-- ============================================================

alter table clients add column if not exists aliases jsonb not null default '[]'::jsonb;

alter table keywords add column if not exists variants jsonb not null default '[]'::jsonb;
alter table keywords add column if not exists variant_note text;

alter table monitoring_runs add column if not exists query_mode text;
alter table monitoring_runs add column if not exists samples int;

alter table monitoring_results add column if not exists evidence text;
alter table monitoring_results add column if not exists query_text text;

create table if not exists hospital_registry (
  name_key text primary key,
  query_name text not null,
  found boolean not null,
  official_name text,
  address text,
  checked_at timestamptz not null default now()
);
alter table hospital_registry enable row level security;

create table if not exists monitoring_results_judgement_backup_016 as
  select id, mentioned, rank, competitors, now() as backed_up_at from monitoring_results;
alter table monitoring_results_judgement_backup_016 enable row level security;

notify pgrst, 'reload schema';

-- 되돌리기(재판정 결과에 문제가 있을 때만):
-- update monitoring_results r
--    set mentioned = b.mentioned, rank = b.rank, competitors = b.competitors
--   from monitoring_results_judgement_backup_016 b
--  where b.id = r.id;
