-- NFCMENU: точечный фикс SA portfolio write на menu-photos.
-- Только при ошибочном EXISTS (name / venue.name вместо objects.name):
--   Superadmin uploads portfolio photos (INSERT)
--   Superadmin replaces portfolio photos (UPDATE)
--   Superadmin deletes portfolio photos (DELETE)
--
-- Superadmin reads portfolio photos НЕ создаём и НЕ пересоздаём (уже есть на Production).
-- Owner / Guests / restrictive blocked / другие папки / таблицы / функции — не трогаем.

do $$
declare
  pol_name text;
  using_expr text;
  check_expr text;
  pol_cmd char;
  needs_fix boolean;
  fixed int := 0;
  skipped int := 0;
begin
  if not exists (select 1 from storage.buckets where id = 'menu-photos') then
    raise exception 'NFCMENU 41: нет bucket menu-photos — стоп';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_superadmin'
  ) then
    raise exception 'NFCMENU 41: нет public.is_superadmin() — стоп';
  end if;

  foreach pol_name in array array[
    'Superadmin uploads portfolio photos',
    'Superadmin replaces portfolio photos',
    'Superadmin deletes portfolio photos'
  ]
  loop
    select
      p.polcmd,
      coalesce(pg_get_expr(p.polqual, p.polrelid), ''),
      coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
    into pol_cmd, using_expr, check_expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and p.polname = pol_name;

    if not found then
      needs_fix := true;
      raise notice 'NFCMENU 41: "%" отсутствует — будет создана с objects.name', pol_name;
    else
      -- Ошибка: EXISTS сравнивает UUID с foldername(venue.name) / неквалифицированным name.
      -- Корректный маркер: foldername(objects.name)
      needs_fix := false;

      if pol_name = 'Superadmin uploads portfolio photos' then
        if check_expr = ''
           or check_expr not ilike '%foldername(objects.name)%'
           or check_expr ilike '%foldername(venue.name)%' then
          needs_fix := true;
        end if;
      elsif pol_name = 'Superadmin replaces portfolio photos' then
        if using_expr = ''
           or check_expr = ''
           or using_expr not ilike '%foldername(objects.name)%'
           or check_expr not ilike '%foldername(objects.name)%'
           or using_expr ilike '%foldername(venue.name)%'
           or check_expr ilike '%foldername(venue.name)%' then
          needs_fix := true;
        end if;
      elsif pol_name = 'Superadmin deletes portfolio photos' then
        if using_expr = ''
           or using_expr not ilike '%foldername(objects.name)%'
           or using_expr ilike '%foldername(venue.name)%' then
          needs_fix := true;
        end if;
      end if;

      if needs_fix then
        raise notice 'NFCMENU 41: "%" с ошибочным EXISTS — пересоздаём', pol_name;
      else
        skipped := skipped + 1;
        raise notice 'NFCMENU 41: "%" уже с objects.name — пропуск', pol_name;
      end if;
    end if;

    if not needs_fix then
      continue;
    end if;

    if pol_name = 'Superadmin uploads portfolio photos' then
      drop policy if exists "Superadmin uploads portfolio photos" on storage.objects;
      create policy "Superadmin uploads portfolio photos"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'menu-photos'
        and public.is_superadmin()
        and objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/portfolio/[A-Za-z0-9._-]{1,180}$'
        and exists (
          select 1
          from public.businesses as venue
          where venue.id::text = (storage.foldername(objects.name))[1]
        )
      );
      fixed := fixed + 1;
    elsif pol_name = 'Superadmin replaces portfolio photos' then
      drop policy if exists "Superadmin replaces portfolio photos" on storage.objects;
      create policy "Superadmin replaces portfolio photos"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'menu-photos'
        and public.is_superadmin()
        and objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/portfolio/[A-Za-z0-9._-]{1,180}$'
        and exists (
          select 1
          from public.businesses as venue
          where venue.id::text = (storage.foldername(objects.name))[1]
        )
      )
      with check (
        bucket_id = 'menu-photos'
        and public.is_superadmin()
        and objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/portfolio/[A-Za-z0-9._-]{1,180}$'
        and exists (
          select 1
          from public.businesses as venue
          where venue.id::text = (storage.foldername(objects.name))[1]
        )
      );
      fixed := fixed + 1;
    elsif pol_name = 'Superadmin deletes portfolio photos' then
      drop policy if exists "Superadmin deletes portfolio photos" on storage.objects;
      create policy "Superadmin deletes portfolio photos"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'menu-photos'
        and public.is_superadmin()
        and objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/portfolio/[A-Za-z0-9._-]{1,180}$'
        and exists (
          select 1
          from public.businesses as venue
          where venue.id::text = (storage.foldername(objects.name))[1]
        )
      );
      fixed := fixed + 1;
    end if;
  end loop;

  raise notice 'NFCMENU 41: исправлено=%, пропущено=%. SELECT portfolio не изменялся.', fixed, skipped;
end $$;

-- Контроль: в check/using должен быть foldername(objects.name)
select
  pol.polname as policyname,
  case pol.polcmd
    when 'a' then 'INSERT'
    when 'w' then 'UPDATE'
    when 'd' then 'DELETE'
    when 'r' then 'SELECT'
    else pol.polcmd::text
  end as cmd,
  (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
    || ' '
    || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
  ) ilike '%foldername(objects.name)%' as has_objects_name,
  (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
    || ' '
    || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
  ) ilike '%foldername(venue.name)%' as has_venue_name_bug,
  left(coalesce(pg_get_expr(pol.polqual, pol.polrelid), ''), 180) as using_preview,
  left(coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''), 180) as check_preview
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'storage'
  and c.relname = 'objects'
  and pol.polname in (
    'Superadmin uploads portfolio photos',
    'Superadmin replaces portfolio photos',
    'Superadmin deletes portfolio photos',
    'Superadmin reads portfolio photos'
  )
order by pol.polname;
