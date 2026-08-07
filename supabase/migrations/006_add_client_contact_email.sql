-- 병원(클라이언트)별 리포트 수신 담당자 이메일
-- SQL Editor에서 실행하세요.

alter table clients add column if not exists contact_email text;
