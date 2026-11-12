-- ════════════════════════════════════════════════════════════════════
--  NIA 환경경영 대시보드 · 출장 배출량(Scope 3) 자동 산정
--    · trip_places  : 장소 사전 — 출장 엑셀의 자유 입력 장소명 → 표준 지점 (AI 분류 · 사람 확정)
--    · trip_batches : 업로드 묶음 — 연도·파일 지문·기준표 버전·요약(월별 합계 포함)
--    · trip_rows    : 행별 산정 결과 — 판정 등급·이동횟수·거리·계수·배출량·근거 (검증용 추적)
--  읽기 = 누구나 · 추가·수정·삭제 = 입력·수정, 관리자  (auth_roles.sql 을 먼저 실행한 상태여야 해요)
--  여러 번 실행해도 안전합니다 (이미 있으면 그대로).
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.trip_places (
  raw        text primary key,                       -- 앞뒤 공백을 지운 원문 장소명
  points     text[] not null default '{}',           -- 표준 지점(도시) · 복수 목적지는 여러 개 · 비어 있으면 미확인
  confidence text not null default 'high' check (confidence in ('high', 'low', 'unknown')),
  reason     text,
  source     text not null check (source in ('ai', 'human')),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_batches (
  id          uuid primary key default gen_random_uuid(),
  year        int  not null check (year between 2000 and 2100),
  mode        text not null default 'rail',
  status      text not null default 'saving' check (status in ('saving', 'active', 'replaced')),
  file_name   text,
  file_sha256 text,
  ref_version text,                                   -- index.html 안 기준표(@trip-ref)의 버전
  summary     jsonb not null default '{}'::jsonb,     -- { n, excluded, A, B, C, D, km, kg, kgD, months: {'YYYY-MM': {n, km, kg}}, others }
  uploaded_by text,
  created_at  timestamptz not null default now()
);
create index if not exists trip_batches_year_idx on public.trip_batches (year, mode, status);

create table if not exists public.trip_rows (
  id          bigint generated always as identity primary key,
  batch_id    uuid not null references public.trip_batches (id) on delete cascade,
  year        int  not null,
  seq         int,                                    -- 엑셀의 번호
  trip_date   date,
  mode        text not null default 'rail',
  origin      text,
  via         text,
  dest        text,
  fare        numeric,
  grade       text not null,                          -- A · B · C · D · 제외
  grade_label text,
  legs        int,                                    -- 이동횟수(편도 기준) · 왕복 = 2
  km          numeric,
  factor      numeric,                                -- kgCO2eq/인·km
  kgco2e      numeric,
  basis       text                                    -- 판정 근거 한 줄
);
create index if not exists trip_rows_batch_idx on public.trip_rows (batch_id);
create index if not exists trip_rows_year_idx  on public.trip_rows (year, mode);

-- 장소 사전: 사람이 확정한 줄은 AI 결과로 덮어쓰지 못함 · 바꾼 시각 기록
create or replace function public.trip_places_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.source = 'human' and new.source = 'ai' then
    return old;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trip_places_guard on public.trip_places;
create trigger trip_places_guard before insert or update on public.trip_places
  for each row execute function public.trip_places_guard();

-- 접근 규칙
alter table public.trip_places  enable row level security;
alter table public.trip_batches enable row level security;
alter table public.trip_rows    enable row level security;
grant select on public.trip_places, public.trip_batches, public.trip_rows to anon;
grant select, insert, update, delete on public.trip_places, public.trip_batches, public.trip_rows to authenticated;

do $$
declare t text;
begin
  foreach t in array array['trip_places', 'trip_batches', 'trip_rows'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.app_role()) in (''admin'', ''editor''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.app_role()) in (''admin'', ''editor'')) with check ((select public.app_role()) in (''admin'', ''editor''))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.app_role()) in (''admin'', ''editor''))', t || '_delete', t);
  end loop;
end $$;

-- 화면이 새 표를 바로 알아보도록
notify pgrst, 'reload schema';
