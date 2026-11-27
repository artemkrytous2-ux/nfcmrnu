-- NFCMENU safe-migrations / ЭТАП 3: Storage menu-photos (только РАСШИРЕНИЕ записи)
-- Целевой набор папок для INSERT/UPDATE/DELETE: banner | products | pwa-icon | portfolio
--
-- НЕ меняет SELECT-политики (в т.ч. Owner reads / Guests read) — без сужения чтения.
-- НЕ меняет restrictive blocked/archived guest/owner SELECT.
-- НЕ меняет delete_archived_business (обновление — отдельное решение).
-- НЕ удаляет неизвестные политики storage.objects.
-- Не трогает bucket activation-media и объекты файлов.
-- Идемпотентно: если upload/replace/delete уже содержат portfolio — перепись пропускается.

do $$
declare
  target_folders text[] := array['banner', 'products', 'pwa-icon', 'portfolio'];
  write_policy_names text[] := array[
    'Owner uploads own menu photos',
    'Owner replaces own menu photos',
    'Owner deletes own menu photos',
    'Superadmin uploads menu photos',
    'Superadmin replaces menu photos',
    'Superadmin deletes menu photos'
  ];
  folder text;
  pol_name text;
  missing_in_policy text[];
  needs_update boolean := false;
  unknown_policies text := '';
  body text;
begin
  if not exists (select 1 from storage.buckets where id = 'menu-photos') then
    raise exception 'NFCMENU 40: нет bucket menu-photos — стоп';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'current_business_id'
  ) then
    raise exception 'NFCMENU 40: нет current_business_id() — стоп';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_superadmin'
  ) then
    raise exception 'NFCMENU 40: нет is_superadmin() — стоп';
  end if;

  -- Неизвестные политики: только NOTICE, без DROP.
  select string_agg(policyname, ', ' order by policyname)
    into unknown_policies
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname not in (
      'Guests read published menu photos',
      'Guests only see open demo and active menu photos',
      'Owner reads own menu photos',
      'Owner uploads own menu photos',
      'Owner replaces own menu photos',
      'Owner deletes own menu photos',
      'Superadmin reads menu photos',
      'Superadmin uploads menu photos',
      'Superadmin replaces menu photos',
      'Superadmin deletes menu photos',
      'Superadmin reads venue menu files',
      'Superadmin deletes venue menu files',
      'Blocked owner cannot upload menu photos',
      'Blocked owner cannot replace menu photos',
      'Blocked owner cannot delete menu photos',
      'Owner reads own activation media',
      'Owner uploads own activation media',
      'Owner replaces own activation media',
      'Owner deletes own activation media',
      'Superadmin reads activation media',
      'Superadmin uploads activation media',
      'Superadmin replaces activation media',
      'Superadmin deletes activation media'
    );

  if unknown_policies is not null and length(unknown_policies) > 0 then
    raise notice
      'NFCMENU 40: найдены политики storage.objects вне списка NFCMENU: %. Они НЕ изменяются.',
      unknown_policies;
  end if;

  -- Нужно ли расширять write-политики (нет политики или нет portfolio / базовых папок).
  foreach pol_name in array write_policy_names
  loop
    select
      coalesce(pg_get_expr(p.polqual, p.polrelid), '')
      || ' '
      || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
    into body
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and p.polname = pol_name;

    if body is null then
      needs_update := true;
      raise notice 'NFCMENU 40: нет политики "%" — будет создана с полным набором папок', pol_name;
      continue;
    end if;

    missing_in_policy := array[]::text[];
    foreach folder in array target_folders
    loop
      if body not ilike '%' || folder || '%' then
        missing_in_policy := missing_in_policy || array[folder];
      end if;
    end loop;

    if cardinality(missing_in_policy) > 0 then
      needs_update := true;
      raise notice
        'NFCMENU 40: политика "%" не покрывает: %',
        pol_name, array_to_string(missing_in_policy, ', ');
    end if;
  end loop;

  if not needs_update then
    raise notice
      'NFCMENU 40: write-политики уже покрывают banner/products/pwa-icon/portfolio — перепись пропущена. SELECT не трогались.';
    return;
  end if;

  raise notice
    'NFCMENU 40: расширяем только INSERT/UPDATE/DELETE menu-photos. SELECT-политики не изменяются.';

  -- Owner write (полный набор папок; banner/products/pwa-icon сохраняются)
  drop policy if exists "Owner uploads own menu photos" on storage.objects;
  create policy "Owner uploads own menu photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'menu-photos'
    and name ~ (
      '^' || public.current_business_id()::text || '/(banner|products|portfolio|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
    )
  );

  drop policy if exists "Owner replaces own menu photos" on storage.objects;
  create policy "Owner replaces own menu photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'menu-photos'
    and name ~ (
      '^' || public.current_business_id()::text || '/(banner|products|portfolio|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
    )
  )
  with check (
    bucket_id = 'menu-photos'
    and name ~ (
      '^' || public.current_business_id()::text || '/(banner|products|portfolio|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
    )
  );

  drop policy if exists "Owner deletes own menu photos" on storage.objects;
  create policy "Owner deletes own menu photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'menu-photos'
    and name ~ (
      '^' || public.current_business_id()::text || '/(banner|products|portfolio|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
    )
  );

  -- Superadmin write (тот же полный набор; venue must exist)
  drop policy if exists "Superadmin uploads menu photos" on storage.objects;
  create policy "Superadmin uploads menu photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'menu-photos'
    and public.is_superadmin()
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|portfolio|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
    and exists (
      select 1 from public.businesses as venue
      where venue.id::text = (storage.foldername(name))[1]
    )
  );

  drop policy if exists "Superadmin replaces menu photos" on storage.objects;
  create policy "Superadmin replaces menu photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'menu-photos'
    and public.is_superadmin()
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|portfolio|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
    and exists (
      select 1 from public.businesses as venue
      where venue.id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'menu-photos'
    and public.is_superadmin()
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|portfolio|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
    and exists (
      select 1 from public.businesses as venue
      where venue.id::text = (storage.foldername(name))[1]
    )
  );

  drop policy if exists "Superadmin deletes menu photos" on storage.objects;
  create policy "Superadmin deletes menu photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'menu-photos'
    and public.is_superadmin()
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|portfolio|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
  );

  -- Намеренно НЕ трогаем:
  --   Owner reads own menu photos
  --   Guests read published menu photos
  --   Guests only see open demo and active menu photos
  --   Superadmin reads menu photos / Superadmin reads venue menu files
  --   Superadmin deletes venue menu files (отдельная SELECT/DELETE-пара из archive; не удаляем)
  --   Blocked owner cannot upload/replace/delete menu photos
  --   любые неизвестные политики
  --   public.delete_archived_business
end $$;

-- ПРОВЕРКА: write-политики содержат все четыре папки; SELECT не анализируем на сужение здесь.
select
  policyname,
  cmd,
  (
    coalesce(qual, '') || ' ' || coalesce(with_check, '')
  ) ilike '%banner%' as has_banner,
  (
    coalesce(qual, '') || ' ' || coalesce(with_check, '')
  ) ilike '%products%' as has_products,
  (
    coalesce(qual, '') || ' ' || coalesce(with_check, '')
  ) ilike '%pwa-icon%' as has_pwa_icon,
  (
    coalesce(qual, '') || ' ' || coalesce(with_check, '')
  ) ilike '%portfolio%' as has_portfolio
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname in (
    'Owner uploads own menu photos',
    'Owner replaces own menu photos',
    'Owner deletes own menu photos',
    'Superadmin uploads menu photos',
    'Superadmin replaces menu photos',
    'Superadmin deletes menu photos',
    'Owner reads own menu photos',
    'Guests read published menu photos'
  )
order by policyname;
