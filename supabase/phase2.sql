-- ════════════════════════════════════════════════════════════════════
--  NIA 환경경영 대시보드 · 2단계 DB 설정
--  (기타 환경지표 · 설정(연도 마감·로드맵·기준배출량) · 변경 이력 · 연도 마감)
--
--  실행 방법: Supabase 대시보드 → 왼쪽 메뉴 SQL Editor → New query
--            → 이 파일 내용 전체 붙여넣기 → Run
--  여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
--  기존 energy·waste 데이터는 바뀌지 않습니다.
--  로그인·권한 설정(auth_roles.sql)을 한 뒤에 다시 실행해도 권한 규칙은 그대로 둡니다.
-- ════════════════════════════════════════════════════════════════════

-- 0) 예전에 만든 energy·waste 표에 비고(note) 칸이 없으면 추가 (이미 있으면 그대로 · 데이터는 바뀌지 않음)
alter table public.energy add column if not exists note text;
alter table public.waste  add column if not exists note text;

-- 1) 기타 환경지표: 용수 사용량(월별), 친환경차 대수(연도별) 등
create table if not exists public.env_metrics (
  id         uuid primary key default gen_random_uuid(),
  period     text not null check (period ~ '^\d{4}(-(0[1-9]|1[0-2]))?$'),  -- 'YYYY-MM' 월별 / 'YYYY' 연간
  site       text not null,
  item       text not null,
  value      numeric not null check (value >= 0),
  unit       text,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period, site, item)
);

-- 2) 설정: 연도 마감 목록, 폐기물 감축 로드맵, 온실가스 기준배출량(연도별) 등
create table if not exists public.env_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.env_settings (key, value) values ('closed_years', '[]'::jsonb)
  on conflict (key) do nothing;

-- 3) 변경 이력: 트리거만 기록 (대시보드·API에서는 읽기만 가능)
create table if not exists public.change_log (
  id         bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  table_name text not null,
  action     text not null,          -- INSERT / UPDATE / DELETE
  record_id  text,
  old_data   jsonb,
  new_data   jsonb
);
create index if not exists change_log_changed_at_idx on public.change_log (changed_at desc);
alter table public.change_log add column if not exists changed_by text;   -- 누가 (로그인한 이메일 · 로그인 기능 전에는 비어 있음)

create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  -- 값이 그대로인 수정은 기록하지 않음 (수정 시각만 바뀐 경우 포함)
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
    return null;
  end if;
  insert into public.change_log (table_name, action, record_id, old_data, new_data, changed_by)
  values (tg_table_name, tg_op, coalesce(rec->>'id', rec->>'key', rec->>'user_id'),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.jwt() ->> 'email');
  return null;  -- AFTER 트리거라 반환값은 쓰이지 않음
end $$;

-- 수정 시각 자동 갱신
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- 4) 연도 마감: 마감된 연도의 데이터는 추가·수정·삭제 불가 (바뀌기 전·후 연도 모두 검사)
create or replace function public.block_closed_year() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  yrs jsonb;
  y   text;
begin
  select value into yrs from public.env_settings where key = 'closed_years';
  if jsonb_typeof(yrs) = 'array' then
    foreach y in array array[
        left(coalesce(to_jsonb(old)->>'date', to_jsonb(old)->>'period'), 4),
        left(coalesce(to_jsonb(new)->>'date', to_jsonb(new)->>'period'), 4)] loop
      -- "2025"(문자)와 2025(숫자) 어느 쪽으로 적혀 있어도 마감으로 봄
      if y is not null and exists (select 1 from jsonb_array_elements_text(yrs) e where e = y) then
        raise exception '%년은 마감된 연도라 바꿀 수 없습니다. 데이터 관리 → 연도 마감·로드맵에서 마감을 해제한 뒤 수정하세요.', y
          using errcode = 'P0001';
      end if;
    end loop;
  end if;
  return coalesce(new, old);
end $$;

-- 트리거 연결 (다시 실행해도 중복되지 않게 지우고 새로 만듦)
do $$
declare t text;
begin
  foreach t in array array['energy', 'waste', 'env_metrics'] loop
    execute format('drop trigger if exists trg_block_closed on public.%I', t);
    execute format('create trigger trg_block_closed before insert or update or delete on public.%I
                    for each row execute function public.block_closed_year()', t);
    execute format('drop trigger if exists trg_log_change on public.%I', t);
    execute format('create trigger trg_log_change after insert or update or delete on public.%I
                    for each row execute function public.log_change()', t);
  end loop;
  drop trigger if exists trg_log_change on public.env_settings;
  create trigger trg_log_change after insert or update or delete on public.env_settings
    for each row execute function public.log_change();
  drop trigger if exists trg_touch on public.env_metrics;
  create trigger trg_touch before update on public.env_metrics
    for each row execute function public.touch_updated_at();
  drop trigger if exists trg_touch on public.env_settings;
  create trigger trg_touch before update on public.env_settings
    for each row execute function public.touch_updated_at();
end $$;

-- 5) 대시보드(anon 키) 권한 — 기존 energy·waste와 같은 수준으로 읽기·쓰기, 변경 이력은 읽기만
--    로그인·권한 설정(auth_roles.sql)을 이미 했으면 건너뜀 (누구나 읽기·쓰기로 되돌리지 않음)
alter table public.env_metrics  enable row level security;
alter table public.env_settings enable row level security;
alter table public.change_log   enable row level security;
do $$
begin
  if to_regclass('public.app_users') is not null then
    raise notice '로그인·권한 설정이 되어 있어 접근 규칙은 그대로 둡니다 (auth_roles.sql)';
    return;
  end if;
  drop policy if exists env_metrics_rw  on public.env_metrics;
  create policy env_metrics_rw  on public.env_metrics  for all    to anon, authenticated using (true) with check (true);
  drop policy if exists env_settings_rw on public.env_settings;
  create policy env_settings_rw on public.env_settings for all    to anon, authenticated using (true) with check (true);
  drop policy if exists change_log_read on public.change_log;
  create policy change_log_read on public.change_log   for select to anon, authenticated using (true);
  grant select, insert, update, delete on public.env_metrics, public.env_settings to anon, authenticated;
  grant select on public.change_log to anon, authenticated;
end $$;
revoke insert, update, delete, truncate on public.change_log from anon, authenticated;

-- 새 테이블을 API가 바로 알아보도록 스키마 다시 읽기
notify pgrst, 'reload schema';

-- 완료 확인: 아래 결과에 세 테이블이 보이면 성공
select table_name from information_schema.tables
 where table_schema = 'public' and table_name in ('env_metrics', 'env_settings', 'change_log')
 order by table_name;
