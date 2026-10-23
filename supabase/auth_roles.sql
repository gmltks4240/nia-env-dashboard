-- ════════════════════════════════════════════════════════════════════
--  NIA 환경경영 대시보드 · 3단계 DB 설정: 로그인과 권한
--  보기(모니터링)는 로그인 없이 누구나 · 입력·수정은 회원가입 → 관리자 승인 → 권한
--    · 관리자     : 모든 기능 (연도 마감 · 목표·로드맵 · 거점별 적용 항목 · 사용자 권한)
--    · 입력·수정  : 데이터 입력 · 수정 · 삭제 (설정은 못 바꿈)
--    · 모니터링   : 보기만 (올해 현황 · 실적 조회 · 목표·로드맵) — 로그인하지 않은 사람과 같음
--    · 승인 대기  : 가입만 하고 아직 권한이 없는 상태 → 보기만
--    · 권한 거둠  : 관리자가 권한을 거둔 상태 → 보기만 (언제든 다시 줄 수 있음)
--    · 변경 이력 · 사용자 목록은 로그인한 입력·수정 · 관리자만
--
--  ⚠ 실행 전에 꼭
--    1) 바로 아래 first_admin 줄의 admin@example.com 을 첫 관리자(본인) 이메일로 바꾸세요.
--    2) Supabase 대시보드 → Authentication → Sign In / Providers → Email
--         · Allow new users to sign up : 켬 (회원가입 허용)
--         · Confirm email              : 끔 (기본 메일 서버는 팀원 주소로만, 시간당 2통까지 보내서
--                                          가입 확인 메일이 가지 않아요 · 대신 관리자 승인으로 막음)
--    3) 이 SQL을 실행하면 그때부터 로그인하지 않은 접속은 보기만 할 수 있어요 (입력·수정·삭제는 막힘).
--       로그인 기능이 들어간 새 index.html을 이어서 바로 올리세요.
--    (이미 한 번 실행했다면 이메일을 바꾸지 않고 그대로 다시 실행해도 돼요 — 첫 관리자는 그대로)
--
--  실행: SQL Editor → New query → 이 파일 전체 붙여넣기 → Run
--  여러 번 실행해도 안전합니다. 기존 에너지·폐기물·기타 지표·설정 데이터는 바뀌지 않습니다.
--  (phase2.sql을 먼저 실행해 둔 상태를 기준으로 합니다)
-- ════════════════════════════════════════════════════════════════════

-- 0) 첫 관리자 이메일 — 이 사람이 가입하면(이미 가입했으면 지금) 바로 관리자가 됩니다
do $$
declare first_admin text := 'admin@example.com';   -- ← 첫 관리자(본인) 이메일로 바꾸세요
begin
  first_admin := lower(trim(first_admin));
  -- 다시 실행: 첫 관리자가 이미 정해져 있으면 이메일을 안 바꿔도 그대로 진행
  if first_admin = 'admin@example.com' and to_regclass('public.app_admin_seed') is not null then
    if exists (select 1 from public.app_admin_seed) then return; end if;
  end if;
  if first_admin = 'admin@example.com' or first_admin !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception '첫 관리자 이메일을 적어 주세요 — 이 SQL 맨 위 first_admin 줄의 admin@example.com 을 본인 이메일로 바꾼 뒤 다시 실행하세요';
  end if;
  create table if not exists public.app_admin_seed (email text primary key);
  insert into public.app_admin_seed (email) values (first_admin) on conflict do nothing;
end $$;
revoke all on public.app_admin_seed from anon, authenticated;   -- 대시보드·API에서는 볼 수 없음
alter table public.app_admin_seed enable row level security;     -- 규칙 없음 = API로는 아무도 못 읽음 (Supabase 보안 경고 방지)

-- 1) 사용자 표: 가입하면 자동으로 한 줄 생김 (role이 비어 있으면 승인 대기)
create table if not exists public.app_users (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  name        text,
  dept        text,
  role        text check (role in ('admin', 'editor', 'viewer')),   -- admin 관리자 · editor 입력·수정 · viewer 모니터링 · null 승인 대기(또는 권한 거둠) — 보기는 모두 가능
  created_at  timestamptz not null default now(),
  approved_at timestamptz,   -- 마지막으로 권한을 처리한 시각
  approved_by text           -- 처리한 관리자 이메일 (비어 있으면 아직 한 번도 처리 안 한 승인 대기)
);

-- 2) 회원가입 → 사용자 표에 등록 (가입할 때 적은 이름·부서 · 첫 관리자 이메일이면 바로 관리자)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare is_seed boolean := exists (select 1 from public.app_admin_seed s where s.email = lower(new.email));
begin
  insert into public.app_users (user_id, email, name, dept, role, approved_at, approved_by)
  values (new.id, lower(new.email),
          left(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), 40),
          left(nullif(trim(new.raw_user_meta_data ->> 'dept'), ''), 60),
          case when is_seed then 'admin' end,
          case when is_seed then now() end,
          case when is_seed then '첫 관리자 (SQL)' end)
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이 SQL보다 먼저 가입한 계정도 사용자 표에 넣고, 첫 관리자 이메일은 관리자로
insert into public.app_users (user_id, email, name, dept)
select u.id, lower(u.email), left(nullif(trim(u.raw_user_meta_data ->> 'name'), ''), 40), left(nullif(trim(u.raw_user_meta_data ->> 'dept'), ''), 60)
  from auth.users u
 where u.email is not null
on conflict (user_id) do nothing;
update public.app_users a
   set role = 'admin', approved_at = coalesce(a.approved_at, now()), approved_by = coalesce(a.approved_by, '첫 관리자 (SQL)')
 where a.role is distinct from 'admin' and exists (select 1 from public.app_admin_seed s where s.email = a.email);

-- 3) 지금 로그인한 사람의 권한 (아래 접근 규칙에서 씀) — 승인 대기·로그인 안 함 = null
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.app_users where user_id = auth.uid()
$$;

-- 4) 권한 바꾸기 (관리자만) — 마지막 관리자는 내릴 수 없음 · 처리한 사람과 시각을 남김
--    (권한을 거둔 계정도 처리 기록이 남아 '승인 대기'와 구분됨: role 없음 + approved_by 있음 = 권한 거둠)
create or replace function public.set_user_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
declare me text := coalesce(auth.jwt() ->> 'email', '관리자');
begin
  if public.app_role() is distinct from 'admin' then
    raise exception '관리자만 권한을 바꿀 수 있어요' using errcode = '42501';
  end if;
  if new_role is not null and new_role not in ('admin', 'editor', 'viewer') then
    raise exception '알 수 없는 권한이에요: %', new_role using errcode = '22023';
  end if;
  if new_role is distinct from 'admin'
     and exists (select 1 from public.app_users where user_id = target and role = 'admin')
     and (select count(*) from public.app_users where role = 'admin') <= 1 then
    raise exception '마지막 관리자는 권한을 내릴 수 없어요 · 다른 사람을 먼저 관리자로 지정하세요' using errcode = 'P0001';
  end if;
  update public.app_users
     set role = new_role, approved_at = now(), approved_by = me
   where user_id = target;
  if not found then
    raise exception '사용자를 찾을 수 없어요' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- 5) 변경 이력에 '누가' 바꿨는지 (로그인한 이메일) · 사용자 권한 변경도 기록
alter table public.change_log add column if not exists changed_by text;
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
drop trigger if exists trg_log_change on public.app_users;
create trigger trg_log_change after update on public.app_users
  for each row execute function public.log_change();

-- 6) 권한별 접근 규칙 (RLS) — 보기는 누구나(로그인하지 않은 접속 포함) · 쓰기는 권한별
--    (select public.app_role()) = 요청마다 한 번만 확인 (줄마다 확인하지 않아 빠름)
alter table public.energy       enable row level security;
alter table public.waste        enable row level security;
alter table public.env_metrics  enable row level security;
alter table public.env_settings enable row level security;
alter table public.change_log   enable row level security;
alter table public.app_users    enable row level security;

-- 예전 규칙(누구나 읽기·쓰기)은 모두 지우고 새로 만듦
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
            where schemaname = 'public'
              and tablename in ('energy', 'waste', 'env_metrics', 'env_settings', 'change_log', 'app_users') loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

revoke all on public.energy, public.waste, public.env_metrics, public.env_settings, public.change_log, public.app_users from anon;
grant select on public.energy, public.waste, public.env_metrics, public.env_settings to anon;   -- 로그인하지 않은 접속: 보기만
grant select, insert, update, delete on public.energy, public.waste, public.env_metrics, public.env_settings to authenticated;
grant select on public.change_log to authenticated;
revoke insert, update, delete, truncate on public.change_log from authenticated;
revoke insert, update, delete, truncate on public.app_users from authenticated;
grant select on public.app_users to authenticated;
grant update (name, dept) on public.app_users to authenticated;   -- 권한(role)은 set_user_role()로만

-- 에너지 · 폐기물 · 기타 지표: 읽기 = 누구나 · 추가·수정·삭제 = 입력·수정, 관리자
do $$
declare t text;
begin
  foreach t in array array['energy', 'waste', 'env_metrics'] loop
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.app_role()) in (''admin'', ''editor''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.app_role()) in (''admin'', ''editor'')) with check ((select public.app_role()) in (''admin'', ''editor''))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.app_role()) in (''admin'', ''editor''))', t || '_delete', t);
  end loop;
end $$;

-- 설정(연도 마감·목표·로드맵 등 화면에 필요한 값): 읽기 = 누구나 · 쓰기 = 관리자 (입력·수정은 입력표의 '해당없음(-)' 표시만)
create policy env_settings_read   on public.env_settings for select to anon, authenticated using (true);
create policy env_settings_insert on public.env_settings for insert to authenticated
  with check ((select public.app_role()) = 'admin' or ((select public.app_role()) = 'editor' and key = 'na_cells'));
create policy env_settings_update on public.env_settings for update to authenticated
  using ((select public.app_role()) = 'admin' or ((select public.app_role()) = 'editor' and key = 'na_cells'))
  with check ((select public.app_role()) = 'admin' or ((select public.app_role()) = 'editor' and key = 'na_cells'));
create policy env_settings_delete on public.env_settings for delete to authenticated using ((select public.app_role()) = 'admin');

-- 변경 이력: 입력·수정, 관리자만 읽기 (사용자 권한 변경 기록은 관리자만) · 기록은 트리거만
create policy change_log_read on public.change_log for select to authenticated
  using ((select public.app_role()) = 'admin' or ((select public.app_role()) = 'editor' and table_name <> 'app_users'));

-- 사용자 표: 본인 줄은 본인이, 전체는 관리자가 읽음 · 본인은 이름·부서만 고칠 수 있음
create policy app_users_read on public.app_users for select to authenticated using (user_id = auth.uid() or (select public.app_role()) = 'admin');
create policy app_users_update_self on public.app_users for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 새 표·함수를 API가 바로 알아보도록 스키마 다시 읽기
notify pgrst, 'reload schema';

-- 완료 확인: 첫 관리자 줄(이미 가입했다면)과 표마다 규칙 수
select 'app_users' as "확인", count(*) filter (where role = 'admin') as "관리자", count(*) filter (where role is null) as "승인 대기", count(*) as "전체"
  from public.app_users;
