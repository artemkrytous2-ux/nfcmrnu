-- NFCMENU safe-migrations / businesses.theme
-- Аддитивно. Существующие строки получают theme='default'.
-- Несовместимые значения theme → стоп до добавления CHECK.

do $$
begin
  if to_regclass('public.businesses') is null then
    raise exception 'NFCMENU 22: нет public.businesses — стоп';
  end if;
end $$;

alter table public.businesses
  add column if not exists theme text not null default 'default';

do $$
begin
  if exists (
    select 1
    from public.businesses
    where theme is not null
      and theme not in ('default', 'minimal', 'warm', 'natural', 'soft', 'modern')
  ) then
    raise exception
      'NFCMENU 22: найдены theme вне допустимого набора — исправьте данные до CHECK';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'businesses_theme_check'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_theme_check
      check (theme in ('default', 'minimal', 'warm', 'natural', 'soft', 'modern'));
  end if;
end $$;

-- ПРОВЕРКА
select
  '22-theme' as migration,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'theme'
  ) as column_ok,
  exists (
    select 1 from pg_constraint
    where conname = 'businesses_theme_check'
      and conrelid = 'public.businesses'::regclass
  ) as check_ok;
