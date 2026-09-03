-- ============================================================
-- 키워드를 지워도 과거 모니터링 기록이 남도록 바꿉니다.
--
-- 문제:
--   monitoring_results.keyword_id 가 keywords(id) 를 on delete cascade 로
--   참조하고 있어서, 화면에서 질문 하나를 삭제하면 그 질문으로 쌓아 온
--   모든 모니터링 결과가 함께 사라졌습니다. 실제로 2026-09-03에 박진영병원
--   키워드를 다시 등록하는 과정에서 실행 기록 44회분이 통째로 비었습니다.
--
-- 조치 세 가지:
--   1) keywords.deleted_at  — 앱은 이제 진짜 삭제 대신 '지운 것으로 표시'만 합니다.
--   2) keyword_text 스냅샷  — 결과에 질문 문구를 직접 복사해 둡니다.
--   3) on delete set null   — 혹시 DB에서 직접 지워도 결과가 삭제되지 않습니다.
--
-- 실행 위치: Supabase 대시보드 > SQL Editor (전체를 한 번에 붙여넣고 Run)
-- 되돌릴 필요가 없는 안전한 변경입니다. 데이터를 지우지 않습니다.
-- ============================================================


-- ── 1. 소프트 삭제 컬럼 ──────────────────────────────────────
alter table keywords
  add column if not exists deleted_at timestamptz;

-- 살아 있는 질문만 골라 오는 조회가 잦으므로 부분 인덱스를 둡니다.
create index if not exists idx_keywords_client_active
  on keywords (client_id)
  where deleted_at is null;


-- ── 2. 결과에 질문 문구를 복사해 둡니다 ──────────────────────
-- 질문 행이 사라져도 "무엇을 물어본 결과인지"는 남아 있어야 합니다.
alter table monitoring_results
  add column if not exists keyword_text text;

update monitoring_results r
   set keyword_text = k.text
  from keywords k
 where k.id = r.keyword_id
   and r.keyword_text is null;


-- ── 3. 연쇄 삭제 해제 ────────────────────────────────────────
-- 질문이 지워지면 결과까지 지우는 대신, 결과는 남기고 연결만 끊습니다.
alter table monitoring_results
  alter column keyword_id drop not null;

-- 제약 이름이 환경마다 다를 수 있어 이름을 찾아서 지웁니다.
do $$
declare
  fk_name text;
begin
  select conname into fk_name
    from pg_constraint
   where conrelid = 'monitoring_results'::regclass
     and contype = 'f'
     and conkey = array[
       (select attnum from pg_attribute
         where attrelid = 'monitoring_results'::regclass and attname = 'keyword_id')
     ];

  if fk_name is not null then
    execute format('alter table monitoring_results drop constraint %I', fk_name);
  end if;
end $$;

alter table monitoring_results
  add constraint monitoring_results_keyword_id_fkey
  foreign key (keyword_id) references keywords(id) on delete set null;


-- ── 확인 ─────────────────────────────────────────────────────
-- (1) 삭제 규칙이 'a'(set null)로 바뀌었는지 — 이전에는 'c'(cascade)였습니다
select conname as 제약이름,
       case confdeltype when 'a' then 'set null (정상)'
                        when 'c' then 'cascade (아직 위험)'
                        else confdeltype end as 삭제규칙
  from pg_constraint
 where conrelid = 'monitoring_results'::regclass
   and contype = 'f'
   and conname = 'monitoring_results_keyword_id_fkey';

-- (2) 질문 문구가 잘 복사됐는지 — 비어 있는 행이 0이어야 합니다
select count(*) as 문구_없는_결과
  from monitoring_results
 where keyword_text is null;
