-- 기존 Supabase 프로젝트에 클라이언트 상세정보 컬럼을 추가합니다.
-- SQL Editor에서 실행하세요.

alter table clients add column if not exists region text;
alter table clients add column if not exists department text;
alter table clients add column if not exists director_name text;
alter table clients add column if not exists is_specialist boolean;
