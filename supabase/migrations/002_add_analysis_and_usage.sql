-- 미노출 원인 분석 + 비용 추적을 위한 컬럼 추가
-- SQL Editor에서 실행하세요.

alter table monitoring_results add column if not exists analysis_note text;
alter table monitoring_results add column if not exists model text;
alter table monitoring_results add column if not exists input_tokens int;
alter table monitoring_results add column if not exists output_tokens int;
alter table monitoring_results add column if not exists estimated_cost_usd numeric;
