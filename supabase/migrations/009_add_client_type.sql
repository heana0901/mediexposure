-- 병원 외 업종(쇼핑몰/일반 사업자 등) 고객 지원을 위한 업종 구분
-- SQL Editor에서 실행하세요.

alter table clients add column if not exists client_type text not null default 'hospital';
