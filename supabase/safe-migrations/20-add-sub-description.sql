-- NFCMENU safe-migrations / businesses.sub_description
-- Аддитивно. Данные сохраняются. Повторный запуск безопасен.
-- Зависимости: 10-require-core (таблица businesses).

do $$
begin
  if to_regclass('public.businesses') is null then
    raise exception 'NFCMENU 20: нет public.businesses — стоп';
  end if;
end $$;

alter table public.businesses
  add column if not exists sub_description text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'businesses_sub_description_length_check'
      and conrelid = 'public.businesses'::regclass
  ) then
    if exists (
      select 1
      from public.businesses
      where char_length(sub_description) > 150
    ) then
      raise exception
        'NFCMENU 20: есть строки с sub_description > 150 символов — ограничение не добавлено. Исправьте данные вручную.';
    end if;

    alter table public.businesses
      add constraint businesses_sub_description_length_check
      check (char_length(sub_description) <= 150);
  end if;
end $$;

-- ПРОВЕРКА
select
  '20-sub-description' as migration,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'sub_description'
  ) as column_ok,
  exists (
    select 1 from pg_constraint
    where conname = 'businesses_sub_description_length_check'
      and conrelid = 'public.businesses'::regclass
  ) as check_ok;
