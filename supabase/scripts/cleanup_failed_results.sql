-- ============================================================
-- AI 호출 실패로 '미노출'처럼 저장된 가짜 기록 정리
--
-- 배경:
--   OpenAI 크레딧이 떨어진 동안 ChatGPT 호출이 429로 실패했는데, 예전 코드는
--   그 실패를 mentioned=false 인 정상 결과처럼 저장했습니다. 그래서 노출률이
--   '0%'로 집계됐지만 실제로는 '물어보지도 못한' 상태였습니다.
--
--   지금 배포된 코드는 실패를 결과로 저장하지 않습니다. 이 스크립트는 과거에
--   쌓인 기록만 정리합니다.
--
-- 실행 위치: Supabase 대시보드 > SQL Editor
-- 실행 순서: 1 → 2 → 3 → 4 (5는 되돌릴 때만)
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. 무엇이 지워지는지 먼저 확인 (아무것도 바꾸지 않습니다)
-- ────────────────────────────────────────────────────────────
-- 판별 조건 두 가지를 함께 씁니다:
--   raw_response LIKE '[오류]%'  → 호출 실패 시에만 붙는 접두사
--   model IS NULL                → 실패한 호출은 모델명을 남기지 못함
-- 둘 다 만족해야 지우므로, 실제 AI 답변이 잘못 걸릴 여지가 없습니다.

select
  date(r.created_at at time zone 'Asia/Seoul') as 날짜,
  c.name                                       as 클라이언트,
  r.provider,
  count(*)                                     as 가짜기록,
  min(left(r.raw_response, 80))                as 오류메시지
from monitoring_results r
join monitoring_runs   n on n.id = r.run_id
join clients           c on c.id = n.client_id
where r.raw_response like '[오류]%'
  and r.model is null
group by 1, 2, 3
order by 1, 2;


-- 정리 전후로 노출률이 어떻게 바뀌는지 미리 보기
select
  c.name as 클라이언트,
  r.provider,
  count(*)                                                   as 전체,
  count(*) filter (where r.mentioned)                        as 노출,
  round(100.0 * count(*) filter (where r.mentioned) / count(*), 1) as "정리전_노출률%",
  count(*) filter (where r.raw_response like '[오류]%' and r.model is null) as 가짜,
  case
    when count(*) filter (where not (r.raw_response like '[오류]%' and r.model is null)) = 0
      then null
    else round(
      100.0 * count(*) filter (where r.mentioned)
      / count(*) filter (where not (r.raw_response like '[오류]%' and r.model is null)), 1)
  end as "정리후_노출률%"
from monitoring_results r
join monitoring_runs   n on n.id = r.run_id
join clients           c on c.id = n.client_id
group by 1, 2
order by 1, 2;


-- ────────────────────────────────────────────────────────────
-- 2. 백업 (되돌릴 수 있게 먼저 복사해 둡니다)
-- ────────────────────────────────────────────────────────────
create table if not exists monitoring_results_failed_backup as
select *, now() as backed_up_at
from monitoring_results
where raw_response like '[오류]%'
  and model is null;

-- 백업된 행 수 확인 — 1번에서 본 합계와 같아야 합니다
select count(*) as 백업된_행 from monitoring_results_failed_backup;


-- ────────────────────────────────────────────────────────────
-- 3. 삭제
-- ────────────────────────────────────────────────────────────
-- 지운 행을 그대로 돌려주므로, 결과 개수로 실제 삭제량을 확인할 수 있습니다.
delete from monitoring_results
where raw_response like '[오류]%'
  and model is null
returning id, run_id, provider, created_at;


-- 모든 결과가 사라진 실행(run)이 있으면 함께 정리합니다.
-- (한 제공자만 실패한 실행은 남은 결과가 있으므로 지워지지 않습니다)
delete from monitoring_runs n
where not exists (
  select 1 from monitoring_results r where r.run_id = n.id
)
returning id, client_id, created_at;


-- ────────────────────────────────────────────────────────────
-- 4. 검증
-- ────────────────────────────────────────────────────────────
-- (1) 남은 가짜 기록이 0이어야 합니다
select count(*) as 남은_가짜기록
from monitoring_results
where raw_response like '[오류]%'
  and model is null;

-- (2) 정리 후 제공자별 노출률
--     ChatGPT 행이 통째로 없는 날짜는 화면에서 0%가 아니라 '측정 없음'으로 표시됩니다.
select
  c.name as 클라이언트,
  r.provider,
  count(*)                            as 전체,
  count(*) filter (where r.mentioned) as 노출,
  round(100.0 * count(*) filter (where r.mentioned) / count(*), 1) as "노출률%"
from monitoring_results r
join monitoring_runs   n on n.id = r.run_id
join clients           c on c.id = n.client_id
group by 1, 2
order by 1, 2;

-- (3) 고아 결과가 없는지 확인 (0이어야 합니다)
select count(*) as 고아_결과
from monitoring_results r
where not exists (select 1 from monitoring_runs n where n.id = r.run_id);


-- ────────────────────────────────────────────────────────────
-- 5. 되돌리기 (문제가 생겼을 때만)
-- ────────────────────────────────────────────────────────────
-- 주의: 3번에서 빈 run까지 지웠다면, run이 먼저 복구돼야 결과를 되돌릴 수 있습니다.
--       이번 정리에서는 빈 run이 생기지 않으므로 아래 한 줄이면 충분합니다.
--
-- insert into monitoring_results
--   select id, run_id, keyword_id, provider, mentioned, rank, raw_response,
--          competitors, analysis_note, model, input_tokens, output_tokens,
--          estimated_cost_usd, sources, searched, search_queries, created_at
--   from monitoring_results_failed_backup;
--
-- 정리 결과에 문제가 없다고 판단되면 백업 테이블을 지웁니다:
-- drop table monitoring_results_failed_backup;
