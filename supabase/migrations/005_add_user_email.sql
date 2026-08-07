-- 계정별 리포트 수신 이메일 주소
-- SQL Editor에서 실행하세요.

alter table app_users add column if not exists email text;
