-- AI 답변의 인용 출처(사이트명/URL)를 저장하기 위한 컬럼 추가
-- SQL Editor에서 실행하세요.

alter table monitoring_results add column if not exists sources jsonb not null default '[]'::jsonb;
