-- 병원별 홈페이지 URL 저장 (홈페이지 분석 탭에서 재사용)
-- SQL Editor에서 실행하세요.

alter table clients add column if not exists website_url text;
