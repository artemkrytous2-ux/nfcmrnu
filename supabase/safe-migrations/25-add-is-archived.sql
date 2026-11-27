-- NFCMENU safe-migrations / businesses.is_archived (только колонка + мягкое обновление lock)
-- НЕ переписывает десятки restrictive-политик из archive.sql.
-- Если preflight показывает, что политики ещё не учитывают is_archived — решайте отдельно
-- после просмотра живых pg_policies (не вслепую).
-- Запрещено: DROP TABLE / массовое удаление заведений.

do $$
begin
  if to_regclass('public.businesses') is null then
    raise exception 'NFCMENU 25: нет public.businesses — стоп';
  end if;
end $$;

alter table public.businesses
  add column if not exists is_archived boolean not null default false;

do $$
begin
  -- Обновляем lock_business_identity только если уже есть status/is_blocked/is_superadmin.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'status'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'is_blocked'
  ) or not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_superadmin'
  ) then
    raise notice
      'NFCMENU 25: колонка is_archived добавлена/есть, но lock_business_identity не обновлён (нет status/is_blocked/is_superadmin).';
    return;
  end if;

  create or replace function public.lock_business_identity()
  returns trigger
  language plpgsql
  set search_path = pg_catalog, public
  as $fn$
  begin
    if tg_op = 'UPDATE'
       and auth.uid() is not null
       and not public.is_superadmin()
       and (
         new.owner_id is distinct from old.owner_id
         or new.slug is distinct from old.slug
         or new.is_published is distinct from old.is_published
         or new.status is distinct from old.status
         or new.is_blocked is distinct from old.is_blocked
         or new.is_archived is distinct from old.is_archived
       ) then
      raise exception 'Адрес страницы, владельца, публикацию и архив меняет только администратор NFCMENU';
    end if;

    if tg_op = 'INSERT'
       and auth.uid() is not null
       and not public.is_superadmin() then
      raise exception 'Адрес страницы, владельца и публикацию меняет только администратор NFCMENU';
    end if;

    new.is_published := new.status in ('demo', 'active')
      and not new.is_blocked
      and not new.is_archived;
    return new;
  end;
  $fn$;

  revoke all on function public.lock_business_identity() from public, anon, authenticated;
  grant execute on function public.lock_business_identity() to authenticated, service_role;

  raise notice 'NFCMENU 25: lock_business_identity обновлён с учётом is_archived.';
end $$;

-- ПРОВЕРКА
select
  '25-is-archived' as migration,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'is_archived'
  ) as column_ok,
  (
    select count(*) = 0
    from public.businesses
    where is_archived is null
  ) as no_nulls;
