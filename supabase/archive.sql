-- NFCMENU: архив заведений и окончательное удаление.
-- Запускать один раз в SQL Editor после supabase/superadmin.sql.
-- Этот файл не изменяет schema.sql и superadmin.sql.
--
-- Файлы menu-photos эта функция не удаляет. Триггер storage.protect_delete
-- запрещает прямой DELETE из storage.objects,
-- пока в сессии не установлен storage.allow_delete_query = 'true'. Даже после
-- этого флага SQL удаляет только строку каталога и оставляет сам файл.
-- Файлы удаляет серверный Storage API до вызова функции. Клиент Storage
-- для remove() требует и SELECT, и DELETE. Функция проверяет, что у этого
-- UUID не осталось объектов, и только потом удаляет строки PostgreSQL.
-- Владелец функции должен обходить RLS, иначе проверка файлов ненадёжна.
--
-- Новые политики ниже разрешают SUPERADMIN читать и удалять любой путь
-- menu-photos вида {uuid}/banner|products/{файл}. Ограничение «только одно
-- архивное заведение» политика выразить не может: его проверяют сервер и
-- delete_archived_business. Restrictive-политика удаления по-прежнему
-- требует is_superadmin() либо свою незаблокированную и неархивную папку,
-- поэтому владелец чужие файлы не получает.

alter table public.businesses
  add column is_archived boolean not null default false;

create or replace function public.lock_business_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
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
$$;

revoke all on function public.lock_business_identity() from public, anon, authenticated;
grant execute on function public.lock_business_identity() to authenticated, service_role;

drop policy if exists "Blocked owner cannot update business" on public.businesses;
create policy "Blocked owner cannot update business"
on public.businesses as restrictive
for update
to authenticated
using ((not is_blocked and not is_archived) or public.is_superadmin())
with check ((not is_blocked and not is_archived) or public.is_superadmin());

drop policy if exists "Guests only see open demo and active businesses" on public.businesses;
create policy "Guests only see open demo and active businesses"
on public.businesses as restrictive
for select
to anon
using (status in ('demo', 'active') and not is_blocked and not is_archived);

drop policy if exists "Blocked owner cannot insert categories" on public.categories;
create policy "Blocked owner cannot insert categories"
on public.categories as restrictive
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

drop policy if exists "Blocked owner cannot update categories" on public.categories;
create policy "Blocked owner cannot update categories"
on public.categories as restrictive
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

drop policy if exists "Blocked owner cannot delete categories" on public.categories;
create policy "Blocked owner cannot delete categories"
on public.categories as restrictive
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

drop policy if exists "Guests only see open demo and active categories" on public.categories;
create policy "Guests only see open demo and active categories"
on public.categories as restrictive
for select
to anon
using (
  exists (
    select 1
    from public.businesses as venue
    where venue.id = business_id
      and venue.status in ('demo', 'active')
      and not venue.is_blocked
      and not venue.is_archived
  )
);

drop policy if exists "Blocked owner cannot insert products" on public.products;
create policy "Blocked owner cannot insert products"
on public.products as restrictive
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

drop policy if exists "Blocked owner cannot update products" on public.products;
create policy "Blocked owner cannot update products"
on public.products as restrictive
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

drop policy if exists "Blocked owner cannot delete products" on public.products;
create policy "Blocked owner cannot delete products"
on public.products as restrictive
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

drop policy if exists "Guests only see open demo and active products" on public.products;
create policy "Guests only see open demo and active products"
on public.products as restrictive
for select
to anon
using (
  exists (
    select 1
    from public.businesses as venue
    where venue.id = business_id
      and venue.status in ('demo', 'active')
      and not venue.is_blocked
      and not venue.is_archived
  )
);

drop policy if exists "Blocked owner cannot update orders" on public.orders;
create policy "Blocked owner cannot update orders"
on public.orders as restrictive
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
    where venue.id::text = (storage.foldername(name))[1]
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
    where venue.id::text = (storage.foldername(name))[1]
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
    where venue.id::text = (storage.foldername(name))[1]
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
    where venue.id::text = (storage.foldername(name))[1]
      and venue.owner_id = auth.uid()
      and not venue.is_blocked
      and not venue.is_archived
  )
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
    where venue.id::text = (storage.foldername(name))[1]
      and venue.status in ('demo', 'active')
      and not venue.is_blocked
      and not venue.is_archived
  )
);

-- Permissive: сами по себе не обходят restrictive-политику удаления.
-- Для authenticated на SELECT restrictive-политики нет, чтение реально.
-- Для DELETE restrictive пропускает только SUPERADMIN или владельца своей
-- незаблокированной и неархивной папки.
drop policy if exists "Superadmin reads venue menu files" on storage.objects;
create policy "Superadmin reads venue menu files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products)/[A-Za-z0-9._-]{1,180}$'
);

drop policy if exists "Superadmin deletes venue menu files" on storage.objects;
create policy "Superadmin deletes venue menu files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products)/[A-Za-z0-9._-]{1,180}$'
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

  v_pattern := '^' || p_business_id::text || '/(banner|products)/[A-Za-z0-9._-]{1,180}$';

  if exists (
    select 1
    from storage.objects
    where bucket_id = 'menu-photos'
      and name ~ v_pattern
  ) then
    raise exception 'Сначала удалите фотографии и баннер этого заведения через Storage API';
  end if;

  if exists (
    select 1
    from storage.objects
    where bucket_id = 'menu-photos'
      and split_part(name, '/', 1) = p_business_id::text
      and name !~ v_pattern
  ) then
    raise exception 'У заведения есть файл вне папок banner и products. Удаление остановлено';
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
