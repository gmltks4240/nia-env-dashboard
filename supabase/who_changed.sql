-- ════════════════════════════════════════════════════════════════════
--  NIA 환경경영 대시보드 · 4단계(선택) DB 설정: 누가 입력·수정했는지 이름으로
--
--  대시보드는 변경 이력(change_log)으로 '누가 · 언제' 입력하고 고쳤는지 보여 줘요.
--    · 데이터 입력표(달마다) · 데이터 목록 · 연도 마감·로드맵 카드 · 입력 현황판 · 그래프를 눌러 연 자료 · 변경 이력
--  이 SQL을 실행하면
--    1) 변경 이력에 바꾼 사람의 '이름'도 남겨요 (지금까지는 로그인 이메일만)
--       → 입력·수정 권한자 화면에도 다른 사람이 이메일 앞부분이 아니라 이름으로 보여요 (관리자 화면은 원래 이름)
--    2) 자료마다 '처음 입력한 사람 · 마지막으로 바꾼 사람'을 한 번에 꺼내는 보기(record_who)를 만들어
--       변경 이력이 많이 쌓여도 빠르게 보여 줘요 (실행 전에는 최근 변경 3,000건 안에서만 찾아요)
--  볼 수 있는 사람은 그대로: 입력·수정 · 관리자만 (로그인하지 않은 접속 · 모니터링은 못 봄 — 변경 이력 규칙과 같음)
--
--  실행: Supabase → SQL Editor → New query → 이 파일 전체 붙여넣기 → Run
--  여러 번 실행해도 안전합니다. 에너지·폐기물·기타 지표·설정 데이터는 바뀌지 않습니다.
--  (phase2.sql · auth_roles.sql을 먼저 실행해 둔 상태를 기준으로 합니다)
-- ════════════════════════════════════════════════════════════════════

-- 1) 변경 이력에 이름 칸 — 바꾼 그때의 가입 이름 (이름을 안 적었으면 이메일)
alter table public.change_log add column if not exists changed_by_name text;
create index if not exists change_log_record_idx on public.change_log (table_name, record_id, changed_at desc);

create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  -- 값이 그대로인 수정은 기록하지 않음 (수정 시각만 바뀐 경우 포함)
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
    return null;
  end if;
  insert into public.change_log (table_name, action, record_id, old_data, new_data, changed_by, changed_by_name)
  values (tg_table_name, tg_op, coalesce(rec->>'id', rec->>'key', rec->>'user_id'),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.jwt() ->> 'email',
          (select coalesce(nullif(trim(u.name), ''), u.email) from public.app_users u where u.user_id = auth.uid()));
  return null;  -- AFTER 트리거라 반환값은 쓰이지 않음
end $$;

-- 지난 기록에도 이름 채우기 (지금 가입 이름 기준 · 로그인 기능 전 기록은 누군지 몰라 비워 둠)
update public.change_log c
   set changed_by_name = coalesce(nullif(trim(u.name), ''), u.email)
  from public.app_users u
 where c.changed_by_name is null and c.changed_by is not null and u.email = lower(c.changed_by);

-- 2) 자료마다 처음 입력한 사람 · 마지막으로 바꾼 사람 (에너지 · 폐기물 · 기타 지표 · 설정)
--    security_invoker = 보는 사람의 권한으로 읽음 → 변경 이력 읽기 규칙(입력·수정 · 관리자)이 그대로 적용
create or replace view public.record_who with (security_invoker = true) as
select l.table_name, l.record_id,
       l.action          as last_action,
       l.changed_at      as updated_at,
       l.changed_by      as updated_by,
       l.changed_by_name as updated_by_name,
       f.changed_at      as created_at,
       f.changed_by      as created_by,
       f.changed_by_name as created_by_name
  from (select distinct on (table_name, record_id) table_name, record_id, action, changed_at, changed_by, changed_by_name
          from public.change_log
         where table_name in ('energy', 'waste', 'env_metrics', 'env_settings') and record_id is not null
         order by table_name, record_id, changed_at desc, id desc) l
  left join lateral (select c.changed_at, c.changed_by, c.changed_by_name
                       from public.change_log c
                      where c.table_name = l.table_name and c.record_id = l.record_id and c.action = 'INSERT'
                      order by c.changed_at, c.id
                      limit 1) f on true;
revoke all on public.record_who from anon;
grant select on public.record_who to authenticated;

-- 새 칸·보기를 API가 바로 알아보도록 스키마 다시 읽기
notify pgrst, 'reload schema';

-- 완료 확인: 이름이 채워진 변경 이력 수 · 누가 바꿨는지 아는 자료 수
select (select count(*) from public.change_log where changed_by_name is not null) as "이름이 채워진 변경 이력",
       (select count(*) from public.change_log where changed_by is null)          as "누군지 기록 없는 변경 (로그인 기능 전)";
