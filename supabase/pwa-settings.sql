-- NFCMENU: название и иконка приложения заведения.
-- Запускать вручную в SQL Editor один раз, после supabase/archive.sql.
-- Этот файл не изменяет schema.sql, superadmin.sql, archive.sql, theme.sql,
-- business-kind.sql и business-kind-protection.sql.
-- Не меняет current_business_id(), политики таблицы businesses и триггеры
-- личности и типа. service_role клиенту не выдаётся.
--
-- Существующие строки получают pwa_name = null и pwa_icon_path = null.
-- Повторный запуск безопасен, пока не применён supabase/portfolio-photos.sql:
-- колонки не дублируются, ограничения и политики пересоздаются.
-- После портфолио этот файл заново сузит список папок до banner, products
-- и pwa-icon, поэтому повторно его не запускают.
-- Файл не применялся к живой базе при подготовке.

alter table public.businesses
  add column if not exists pwa_name text,
  add column if not exists pwa_icon_path text;

alter table public.businesses
  drop constraint if exists businesses_pwa_name_length;

alter table public.businesses
  add constraint businesses_pwa_name_length check (
    pwa_name is null
    or (
      char_length(pwa_name) <= 40
      and char_length(btrim(pwa_name)) between 1 and 40
      and pwa_name = btrim(pwa_name)
    )
  );

alter table public.businesses
  drop constraint if exists businesses_pwa_icon_path_shape;

alter table public.businesses
  add constraint businesses_pwa_icon_path_shape check (
    pwa_icon_path is null
    or (
      char_length(pwa_icon_path) <= 240
      and pwa_icon_path ~ (
        '^' || id::text || '/pwa-icon/[A-Za-z0-9._-]{1,180}$'
      )
    )
  );

-- Владелец по-прежнему пишет только в папку своего current_business_id().
-- Суперадминистратор пишет в папку существующего заведения.
-- Ограничительные политики архива не перечисляют папки и здесь не меняются:
-- заблокированный и архивный владелец по-прежнему не загружает и не удаляет файлы.

drop policy if exists "Owner uploads own menu photos" on storage.objects;
create policy "Owner uploads own menu photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'menu-photos'
  and name ~ (
    '^' || public.current_business_id()::text || '/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
  )
);

drop policy if exists "Owner replaces own menu photos" on storage.objects;
create policy "Owner replaces own menu photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'menu-photos'
  and name ~ (
    '^' || public.current_business_id()::text || '/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
  )
)
with check (
  bucket_id = 'menu-photos'
  and name ~ (
    '^' || public.current_business_id()::text || '/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
  )
);

drop policy if exists "Owner deletes own menu photos" on storage.objects;
create policy "Owner deletes own menu photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'menu-photos'
  and name ~ (
    '^' || public.current_business_id()::text || '/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
  )
);

drop policy if exists "Superadmin reads menu photos" on storage.objects;
create policy "Superadmin reads menu photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
  and exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "Superadmin uploads menu photos" on storage.objects;
create policy "Superadmin uploads menu photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
  and exists (
    select 1
    from public.businesses as venue
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
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
  and exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
  and exists (
    select 1
    from public.businesses as venue
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
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
  and exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "Superadmin reads venue menu files" on storage.objects;
create policy "Superadmin reads venue menu files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
);

drop policy if exists "Superadmin deletes venue menu files" on storage.objects;
create policy "Superadmin deletes venue menu files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
);

create or replace function public.delete_archived_business(
  p_business_id uuid,
  p_slug text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_slug text;
  v_archived boolean;
  v_pattern text;
begin
  if auth.uid() is null or not public.is_superadmin() then
    raise exception 'Удалять заведение может только администратор NFCMENU';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = current_user
      and rolbypassrls
  ) then
    raise exception 'Функция удаления не видит все файлы и остановлена';
  end if;

  if p_business_id is null or p_slug is null then
    raise exception 'Проверьте адрес страницы';
  end if;

  select slug, is_archived
    into v_slug, v_archived
  from public.businesses
  where id = p_business_id
  for update;

  if not found then
    raise exception 'Заведение не найдено';
  end if;

  if not v_archived then
    raise exception 'Сначала перенесите заведение в архив';
  end if;

  if v_slug is distinct from p_slug then
    raise exception 'Адрес страницы не совпадает';
  end if;

  v_pattern := '^' || p_business_id::text || '/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$';

  if exists (
    select 1
    from storage.objects
    where bucket_id = 'menu-photos'
      and name ~ v_pattern
  ) then
    raise exception 'Сначала удалите фотографии, баннер и иконку приложения этого заведения через Storage API';
  end if;

  if exists (
    select 1
    from storage.objects
    where bucket_id = 'menu-photos'
      and split_part(name, '/', 1) = p_business_id::text
      and name !~ v_pattern
  ) then
    raise exception 'У заведения есть файл вне папок banner, products и pwa-icon. Удаление остановлено';
  end if;

  delete from public.orders
  where business_id = p_business_id;

  delete from public.products
  where business_id = p_business_id;

  delete from public.categories
  where business_id = p_business_id;

  delete from public.businesses
  where id = p_business_id
    and is_archived
    and slug = p_slug;

  if not found then
    raise exception 'Заведение не удалено';
  end if;
end;
$$;

revoke all on function public.delete_archived_business(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.delete_archived_business(uuid, text) to authenticated;
