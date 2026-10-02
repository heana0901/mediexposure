-- 병원별 자동 모니터링 주기(일)
-- 비어 있으면 기본 주기(7일, MONITOR_INTERVAL_DAYS)를 쓴다. 계정 관리 화면에서 바꾼다.
-- SQL Editor에서 실행하세요.

alter table clients add column if not exists monitor_interval_days smallint
  check (monitor_interval_days is null or monitor_interval_days between 1 and 60);
