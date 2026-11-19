-- NFCMENU: отдельное портфолио салона.
-- Запускать вручную в SQL Editor один раз, после сверки живых политик.
-- Этот файл не меняет products, categories, заказы и фотографии услуг.
-- RLS не отключается. service_role клиенту не выдаётся.
--
-- Перед запуском посмотрите фактические политики:
--   select polname, polcmd, polpermissive,
--          pg_get_expr(polqual, polrelid) as using_expr,
--          pg_get_expr(polwithcheck, polrelid) as check_expr
--   from pg_policy
--   where polrelid = 'storage.objects'::regclass
--   order by polname;
-- Если в живой базе есть политика storage.objects с тем же действием и ролью,
-- но с именем, которого нет в этом файле, не запускайте скрипт вслепую:
-- две разрешающие политики складываются, две ограничительные тоже остаются вместе.
--
-- Папка portfolio добавляется к banner и products.
-- В ограничительных политиках путь берётся из objects.name, не из venue.name.

create table public.portfolio_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  image_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint portfolio_photos_image_path_length check (char_length(image_path) <= 240),
  constraint portfolio_photos_image_path_shape check (
    image_path ~ (
      '^' || business_id::text || '/portfolio/[A-Za-z0-9._-]{1,180}\.jpg$'
    )
  )
);

alter table public.portfolio_photos enable row level security;

grant select on public.portfolio_photos to anon;
grant select, insert, update, delete on public.portfolio_photos to authenticated;

create policy "Owner reads own portfolio photos"
on public.portfolio_photos for select
to authenticated
using (business_id = public.current_business_id());

create policy "Owner inserts own portfolio photos"
on public.portfolio_photos for insert
to authenticated
with check (business_id = public.current_business_id());

create policy "Owner updates own portfolio photos"
on public.portfolio_photos for update
to authenticated
using (business_id = public.current_business_id())
with check (business_id = public.current_business_id());

create policy "Owner deletes own portfolio photos"
on public.portfolio_photos for delete
to authenticated
using (business_id = public.current_business_id());

create policy "Superadmin reads portfolio photos"
on public.portfolio_photos for select
to authenticated
using (public.is_superadmin());

create policy "Superadmin inserts portfolio photos"
on public.portfolio_photos for insert
to authenticated
with check (public.is_superadmin());

create policy "Superadmin updates portfolio photos"
on public.portfolio_photos for update
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

create policy "Superadmin deletes portfolio photos"
on public.portfolio_photos for delete
to authenticated
using (public.is_superadmin());

create policy "Blocked owner cannot insert portfolio photos"
on public.portfolio_photos as restrictive
for insert
to authenticated
with check (
  public.is_superadmin()
  or exists (
    select 1
    from public.businesses as venue
    where venue.id = business_id
      and venue.owner_id = auth.uid()
      and not venue.is_blocked
      and not venue.is_archived
  )
);

create policy "Blocked owner cannot update portfolio photos"
on public.portfolio_photos as restrictive
for update
to authenticated
using (
  public.is_superadmin()
  or exists (
    select 1
    from public.businesses as venue
    where venue.id = business_id
      and venue.owner_id = auth.uid()
      and not venue.is_blocked
      and not venue.is_archived
  )
)
with check (
  public.is_superadmin()
  or exists (
    select 1
    from public.businesses as venue
    where venue.id = business_id
      and venue.owner_id = auth.uid()
      and not venue.is_blocked
      and not venue.is_archived
  )
);

create policy "Blocked owner cannot delete portfolio photos"
on public.portfolio_photos as restrictive
for delete
to authenticated
using (
  public.is_superadmin()
  or exists (
    select 1
    from public.businesses as venue
    where venue.id = business_id
      and venue.owner_id = auth.uid()
      and not venue.is_blocked
      and not venue.is_archived
  )
);

create policy "Guests read portfolio of open businesses"
on public.portfolio_photos for select
to anon
using (
  exists (
    select 1
    from public.businesses as venue
    where venue.id = portfolio_photos.business_id
      and venue.is_published
      and venue.status in ('demo', 'active')
      and not venue.is_blocked
      and not venue.is_archived
  )
);

-- Storage. Сначала снимаем известные дубли суперадмина из superadmin.sql и archive.sql,
-- затем создаём по одной политике на действие.

drop policy if exists "Owner reads own menu photos" on storage.objects;
create policy "Owner reads own menu photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'menu-photos'
  and (storage.foldername(objects.name))[1] = public.current_business_id()::text
  and objects.name ~ (
    '^' || public.current_business_id()::text || '/(banner|products|portfolio)/[A-Za-z0-9._-]{1,180}$'
  )
);

drop policy if exists "Owner uploads own menu photos" on storage.objects;
create policy "Owner uploads own menu photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'menu-photos'
  and objects.name ~ (
    '^' || public.current_business_id()::text || '/(banner|products|portfolio)/[A-Za-z0-9._-]{1,180}$'
  )
);

drop policy if exists "Owner replaces own menu photos" on storage.objects;
create policy "Owner replaces own menu photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'menu-photos'
  and objects.name ~ (
    '^' || public.current_business_id()::text || '/(banner|products|portfolio)/[A-Za-z0-9._-]{1,180}$'
  )
)
with check (
  bucket_id = 'menu-photos'
  and objects.name ~ (
    '^' || public.current_business_id()::text || '/(banner|products|portfolio)/[A-Za-z0-9._-]{1,180}$'
  )
);

drop policy if exists "Owner deletes own menu photos" on storage.objects;
create policy "Owner deletes own menu photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'menu-photos'
  and objects.name ~ (
    '^' || public.current_business_id()::text || '/(banner|products|portfolio)/[A-Za-z0-9._-]{1,180}$'
  )
);

drop policy if exists "Superadmin reads menu photos" on storage.objects;
drop policy if exists "Superadmin reads venue menu files" on storage.objects;
create policy "Superadmin reads menu photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|portfolio)/[A-Za-z0-9._-]{1,180}$'
);

drop policy if exists "Superadmin uploads menu photos" on storage.objects;
create policy "Superadmin uploads menu photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|portfolio)/[A-Za-z0-9._-]{1,180}$'
  and exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(objects.name))[1]
  )
);

drop policy if exists "Superadmin replaces menu photos" on storage.objects;
create policy "Superadmin replaces menu photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|portfolio)/[A-Za-z0-9._-]{1,180}$'
  and exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(objects.name))[1]
  )
)
with check (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|portfolio)/[A-Za-z0-9._-]{1,180}$'
  and exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(objects.name))[1]
  )
);

drop policy if exists "Superadmin deletes menu photos" on storage.objects;
drop policy if exists "Superadmin deletes venue menu files" on storage.objects;
create policy "Superadmin deletes menu photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products|portfolio)/[A-Za-z0-9._-]{1,180}$'
);

drop policy if exists "Blocked owner cannot upload menu photos" on storage.objects;
create policy "Blocked owner cannot upload menu photos"
on storage.objects as restrictive
for insert
to authenticated
with check (
  bucket_id <> 'menu-photos'
  or public.is_superadmin()
  or exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(objects.name))[1]
      and venue.owner_id = auth.uid()
      and not venue.is_blocked
      and not venue.is_archived
  )
);

drop policy if exists "Blocked owner cannot replace menu photos" on storage.objects;
create policy "Blocked owner cannot replace menu photos"
on storage.objects as restrictive
for update
to authenticated
using (
  bucket_id <> 'menu-photos'
  or public.is_superadmin()
  or exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(objects.name))[1]
      and venue.owner_id = auth.uid()
      and not venue.is_blocked
      and not venue.is_archived
  )
)
with check (
  bucket_id <> 'menu-photos'
  or public.is_superadmin()
  or exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(objects.name))[1]
      and venue.owner_id = auth.uid()
      and not venue.is_blocked
      and not venue.is_archived
  )
);

drop policy if exists "Blocked owner cannot delete menu photos" on storage.objects;
create policy "Blocked owner cannot delete menu photos"
on storage.objects as restrictive
for delete
to authenticated
using (
  bucket_id <> 'menu-photos'
  or public.is_superadmin()
  or exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(objects.name))[1]
      and venue.owner_id = auth.uid()
      and not venue.is_blocked
      and not venue.is_archived
  )
);

drop policy if exists "Guests read published menu photos" on storage.objects;
create policy "Guests read published menu photos"
on storage.objects for select
to anon
using (
  bucket_id = 'menu-photos'
  and (storage.foldername(objects.name))[1] in (
    select businesses.id::text
    from public.businesses
    where businesses.is_published
  )
  and objects.name ~ '^[0-9a-f-]{36}/(banner|products|portfolio)/[A-Za-z0-9._-]{1,180}$'
);

drop policy if exists "Guests only see open demo and active menu photos" on storage.objects;
create policy "Guests only see open demo and active menu photos"
on storage.objects as restrictive
for select
to anon
using (
  bucket_id <> 'menu-photos'
  or exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(objects.name))[1]
      and venue.status in ('demo', 'active')
      and not venue.is_blocked
      and not venue.is_archived
  )
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

  v_pattern := '^' || p_business_id::text || '/(banner|products|portfolio)/[A-Za-z0-9._-]{1,180}$';

  if exists (
    select 1
    from storage.objects
    where bucket_id = 'menu-photos'
      and name ~ v_pattern
  ) then
    raise exception 'Сначала удалите фотографии, баннер и портфолио этого заведения через Storage API';
  end if;

  if exists (
    select 1
    from storage.objects
    where bucket_id = 'menu-photos'
      and split_part(name, '/', 1) = p_business_id::text
      and name !~ v_pattern
  ) then
    raise exception 'У заведения есть файл вне папок banner, products и portfolio. Удаление остановлено';
  end if;

  delete from public.orders
  where business_id = p_business_id;

  delete from public.portfolio_photos
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
