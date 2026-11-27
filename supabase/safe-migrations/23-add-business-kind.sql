-- NFCMENU safe-migrations / businesses.kind
-- Аддитивно. Существующие строки: kind='food'. Политики не меняются.

do $$
begin
  if to_regclass('public.businesses') is null then
    raise exception 'NFCMENU 23: нет public.businesses — стоп';
  end if;
end $$;

alter table public.businesses
  add column if not exists kind text not null default 'food';

do $$
begin
  if exists (
    select 1
    from public.businesses
    where kind is not null
      and kind not in ('food', 'beauty', 'repair', 'catalog')
  ) then
    raise exception
      'NFCMENU 23: найдены kind вне food/beauty/repair/catalog — исправьте данные до CHECK';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'businesses_kind_check'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_kind_check
      check (kind in ('food', 'beauty', 'repair', 'catalog'));
  end if;
end $$;

-- ПРОВЕРКА
select
  '23-kind' as migration,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'kind'
  ) as column_ok,
  exists (
    select 1 from pg_constraint
    where conname = 'businesses_kind_check'
      and conrelid = 'public.businesses'::regclass
  ) as check_ok;
