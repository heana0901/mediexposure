-- 로그인 기능을 위한 사용자/권한 테이블
-- SQL Editor에서 실행하세요.

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists user_clients (
  user_id uuid not null references app_users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  primary key (user_id, client_id)
);
