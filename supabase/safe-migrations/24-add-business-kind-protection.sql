-- NFCMENU safe-migrations / триггер lock_business_kind
-- Не меняет данные kind. Не трогает RLS.
-- Зависимости: колонка kind, функция is_superadmin().

do $$
begin
  if to_regclass('public.businesses') is null then
    raise exception 'NFCMENU 24: нет public.businesses — стоп';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'kind'
  ) then
    raise exception 'NFCMENU 24: нет businesses.kind — сначала 23-add-business-kind.sql';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_superadmin'
  ) then
    raise exception
      'NFCMENU 24: нет public.is_superadmin() — защита kind без суперадмина небезопасна. Сначала разберите SUPERADMIN вручную.';
  end if;
end $$;

create or replace function public.lock_business_kind()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE'
     and auth.uid() is not null
     and not public.is_superadmin()
     and new.kind is distinct from old.kind
  then
    raise exception 'Тип сайта меняет только администратор NFCMENU';
  end if;

  return new;
end;
$$;

revoke all on function public.lock_business_kind() from public, anon, authenticated;
grant execute on function public.lock_business_kind() to authenticated, service_role;

drop trigger if exists businesses_lock_kind on public.businesses;

create trigger businesses_lock_kind
before update on public.businesses
for each row execute function public.lock_business_kind();

-- ПРОВЕРКА
select
  '24-kind-protection' as migration,
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lock_business_kind'
  ) as function_ok,
  exists (
    select 1 from information_schema.triggers
    where event_object_schema = 'public'
      and event_object_table = 'businesses'
      and trigger_name = 'businesses_lock_kind'
  ) as trigger_ok;
