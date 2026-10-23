-- ════════════════════════════════════════════════════════════════════
--  NIA 환경경영 대시보드 · 폐기물 봉투 '규격별' 저장 허용
--  (한 달에 여러 규격의 종량제 봉투를 산 경우 규격마다 한 행으로 저장)
--
--  언제 실행하나요?
--    대시보드에서 같은 달에 두 번째 규격을 저장할 때
--    "지금 DB는 한 달에 봉투 규격을 하나만 저장하게 되어 있어요" 안내가 뜨면 한 번 실행하세요.
--    (안내가 뜨지 않으면 실행하지 않아도 됩니다)
--
--  실행 방법: Supabase 대시보드 → 왼쪽 메뉴 SQL Editor → New query
--            → 이 파일 내용 전체 붙여넣기 → Run
--  여러 번 실행해도 안전합니다. 기존 폐기물 데이터는 바뀌지 않습니다.
-- ════════════════════════════════════════════════════════════════════

-- 1) waste 표에서 '날짜·거점'만으로 한 행만 허용하는 고유 제약·고유 인덱스를 지움
--    (bag_size가 들어 있는 고유 제약·인덱스는 그대로 둠)
do $$
declare r record;
begin
  -- 고유 제약 (unique constraint)
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.waste'::regclass and c.contype = 'u'
       and not exists (select 1 from unnest(c.conkey) k
                         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
                        where a.attname = 'bag_size')
  loop
    execute format('alter table public.waste drop constraint %I', r.conname);
    raise notice '고유 제약 삭제: %', r.conname;
  end loop;
  -- 제약 없이 만든 고유 인덱스 (create unique index …)
  for r in
    select i.indexrelid::regclass::text as idx
      from pg_index i
     where i.indrelid = 'public.waste'::regclass and i.indisunique and not i.indisprimary
       and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
       and not exists (select 1 from unnest(i.indkey::int2[]) k
                         join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k
                        where a.attname = 'bag_size')
  loop
    execute format('drop index %s', r.idx);
    raise notice '고유 인덱스 삭제: %', r.idx;
  end loop;
end $$;

-- 2) 같은 달·거점·규격이 두 번 저장되지 않게 고유 인덱스 추가
--    (이미 겹친 자료가 있으면 건너뜀 — 대시보드에서 그 칸을 고치면 하나로 합쳐짐)
do $$
begin
  if exists (select 1 from pg_index i
              where i.indrelid = 'public.waste'::regclass and i.indisunique and not i.indisprimary
                and exists (select 1 from unnest(i.indkey::int2[]) k
                              join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k
                             where a.attname = 'bag_size')) then
    raise notice '규격(bag_size)이 들어간 고유 제약이 이미 있어요 — 그대로 둡니다';
  elsif exists (select 1 from public.waste group by date, site, bag_size having count(*) > 1) then
    raise notice '같은 달·거점·규격이 겹친 자료가 있어 고유 인덱스는 만들지 않았어요';
  else
    create unique index if not exists waste_date_site_size_key on public.waste (date, site, bag_size);
  end if;
end $$;

-- API가 바뀐 구조를 바로 알아보도록 스키마 다시 읽기
notify pgrst, 'reload schema';

-- 확인: 남은 고유 인덱스 (waste_date_site_size_key처럼 규격이 들어간 인덱스만 보이면 정상)
select indexrelid::regclass as index_name
  from pg_index
 where indrelid = 'public.waste'::regclass and indisunique and not indisprimary;
