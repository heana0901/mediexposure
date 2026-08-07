-- 계정별 이메일은 병원(클라이언트)별 수신 이메일(contact_email)로 대체되어 더 이상 쓰지 않음
-- SQL Editor에서 실행하세요.

alter table app_users drop column if exists email;
