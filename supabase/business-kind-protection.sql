-- NFCMENU: владелец не меняет тип сайта.
-- Запускать один раз в SQL Editor после supabase/business-kind.sql.
-- Этот файл не изменяет schema.sql, superadmin.sql, archive.sql,
-- theme.sql, business-kind.sql и функцию lock_business_identity.
-- Существующие значения kind не обновляются. Политики RLS не меняются.

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
