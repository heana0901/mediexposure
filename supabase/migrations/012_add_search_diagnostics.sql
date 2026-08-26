-- AI가 실제로 웹 검색을 수행했는지, 어떤 검색어를 썼는지 기록하기 위한 컬럼 추가
-- SQL Editor에서 실행하세요.

alter table monitoring_results add column if not exists searched boolean;
alter table monitoring_results add column if not exists search_queries jsonb not null default '[]'::jsonb;
