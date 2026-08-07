-- 병원별 주간 리포트 자동 발송 예약
-- SQL Editor에서 실행하세요.

alter table clients add column if not exists auto_report_enabled boolean not null default false;
alter table clients add column if not exists auto_report_day smallint;
