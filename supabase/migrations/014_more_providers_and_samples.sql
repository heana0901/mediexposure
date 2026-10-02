-- ============================================================
-- AI 엔진 확대(Perplexity·Claude) + 같은 질문 반복 측정
--
-- 1) provider 제약을 넓힙니다.
--    지금까지는 'chatgpt', 'gemini'만 저장할 수 있었습니다.
--    이 마이그레이션 전에 Perplexity·Claude API 키를 넣으면 그 결과만 저장되지 않고
--    화면에 "014 마이그레이션을 실행하세요" 경고가 뜹니다.
--
-- 2) sample_index 컬럼을 추가합니다.
--    AI 답변은 물을 때마다 달라지므로, 한 번의 실행에서 같은 질문을 같은 AI에
--    여러 번(기본 3회) 묻고 각 답변을 한 행씩 저장합니다. 몇 번째 답변인지(0부터)를 기록합니다.
--    기존 행은 1회만 물은 것이므로 0으로 둡니다.
--
-- 실행 위치: Supabase 대시보드 > SQL Editor (전체를 한 번에 붙여넣고 Run)
-- 데이터를 지우지 않는 안전한 변경입니다.
-- ============================================================


-- ── 1. provider 제약 넓히기 ──────────────────────────────────
alter table monitoring_results
  drop constraint if exists monitoring_results_provider_check;

alter table monitoring_results
  add constraint monitoring_results_provider_check
  check (provider in ('chatgpt', 'gemini', 'perplexity', 'claude'));


-- ── 2. 반복 측정 회차 ────────────────────────────────────────
alter table monitoring_results
  add column if not exists sample_index int not null default 0;


-- ── 3. 확인 ──────────────────────────────────────────────────
-- 아래 결과에 perplexity, claude가 보이고 sample_index가 int로 나오면 완료입니다.
select pg_get_constraintdef(oid) as provider_check
from pg_constraint
where conname = 'monitoring_results_provider_check';

select column_name, data_type, column_default
from information_schema.columns
where table_name = 'monitoring_results' and column_name = 'sample_index';
