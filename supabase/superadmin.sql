-- NFCMENU: SUPERADMIN, этап 1.
-- Запускать один раз в SQL Editor после schema.sql. Этот файл не изменяет schema.sql.
-- Первую строку superadmins добавляет только владелец проекта вручную, например:
--   insert into public.superadmins (user_id) values ('00000000-0000-0000-0000-000000000000');
-- Роль нельзя выдать через браузер, user_metadata или политику INSERT.

create table public.superadmins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.superadmins enable row level security;
revoke all on table public.superadmins from public, anon, authenticated, service_role;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.superadmins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_superadmin() from public, anon, authenticated;
grant execute on function public.is_superadmin() to authenticated, service_role;

alter table public.businesses
  add column status text not null default 'draft'
    constraint businesses_status_check check (status in ('draft', 'demo', 'active')),
  add column is_blocked boolean not null default false;

alter table public.businesses
  alter column owner_id drop not null;

alter table public.businesses
  drop constraint businesses_owner_id_key;

create unique index businesses_owner_id_key
  on public.businesses (owner_id)
  where owner_id is not null;

update public.businesses
set status = 'active'
where is_published;

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
     ) then
    raise exception 'Адрес страницы, владельца и публикацию меняет только администратор NFCMENU';
  end if;

  if tg_op = 'INSERT'
     and auth.uid() is not null
     and not public.is_superadmin() then
    raise exception 'Адрес страницы, владельца и публикацию меняет только администратор NFCMENU';
  end if;

  new.is_published := new.status in ('demo', 'active') and not new.is_blocked;
  return new;
end;
$$;

revoke all on function public.lock_business_identity() from public, anon, authenticated;
grant execute on function public.lock_business_identity() to authenticated, service_role;

drop trigger businesses_lock_identity on public.businesses;

create trigger businesses_lock_identity
before insert or update on public.businesses
for each row execute function public.lock_business_identity();

update public.businesses
set is_published = (status in ('demo', 'active') and not is_blocked);

create or replace function public.place_order(
  p_business_id uuid,
  p_pickup text,
  p_pickup_time text,
  p_customer_name text,
  p_customer_phone text,
  p_comment text,
  p_channel text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_business public.businesses%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_product_key text;
  v_quantity integer;
  v_accumulated integer;
  v_line_total bigint;
  v_total bigint := 0;
  v_saved_total bigint;
  v_order_id uuid;
  v_quantities jsonb := '{}'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_phone text := trim(coalesce(p_customer_phone, ''));
  v_name text := trim(coalesce(p_customer_name, ''));
  v_comment text := coalesce(p_comment, '');
  v_pickup_time text := nullif(trim(coalesce(p_pickup_time, '')), '');
begin
  if p_pickup not in ('now', 'soon', 'time') then
    raise exception 'Неверное время получения';
  end if;

  if p_pickup = 'time' and v_pickup_time is null then
    raise exception 'Укажите время';
  end if;

  if v_pickup_time is not null and char_length(v_pickup_time) > 40 then
    raise exception 'Укажите время';
  end if;

  if char_length(v_name) < 2 then
    raise exception 'Укажите имя';
  end if;

  if char_length(v_phone) < 11
     or char_length(v_phone) > 20
     or char_length(regexp_replace(v_phone, '\D', '', 'g')) < 11 then
    raise exception 'Укажите телефон';
  end if;

  if char_length(v_comment) > 500 then
    raise exception 'Слишком длинный комментарий';
  end if;

  if p_channel not in ('telegram', 'max') then
    raise exception 'Неизвестный способ связи';
  end if;

  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 30 then
    raise exception 'В заказе должно быть от 1 до 30 позиций';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or v_item->>'product_id' is null
       or lower(v_item->>'product_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Товар недоступен';
    end if;

    if jsonb_typeof(v_item->'quantity') <> 'number'
       or v_item->>'quantity' !~ '^[1-9][0-9]?$' then
      raise exception 'Неверное количество';
    end if;

    v_product_id := lower(v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_accumulated := coalesce((v_quantities ->> v_product_id::text)::integer, 0);

    if v_accumulated > 99 - v_quantity then
      raise exception 'Неверное количество';
    end if;

    v_quantities := v_quantities || jsonb_build_object(v_product_id::text, v_accumulated + v_quantity);
  end loop;

  if v_quantities = '{}'::jsonb then
    raise exception 'В заказе должно быть от 1 до 30 позиций';
  end if;

  select * into v_business
  from public.businesses
  where id = p_business_id
    and is_published
    and status = 'active'
    and not is_blocked
  for share;

  if not found then
    raise exception 'Заведение не найдено';
  end if;

  if p_channel = 'telegram' and not v_business.telegram_enabled then
    raise exception 'Telegram для этого заведения выключен';
  end if;

  if p_channel = 'max' and not v_business.max_enabled then
    raise exception 'MAX для этого заведения выключен';
  end if;

  for v_product_key in
    select item.key
    from jsonb_each(v_quantities) as item
    order by item.key
  loop
    v_product_id := v_product_key::uuid;
    v_quantity := (v_quantities ->> v_product_key)::integer;

    select * into v_product
    from public.products
    where id = v_product_id
      and business_id = v_business.id
      and is_visible
    for update;

    if not found then
      raise exception 'Товар недоступен';
    end if;

    v_line_total := v_product.price::bigint * v_quantity::bigint;

    if v_line_total > 2147483647 or v_total > 2147483647 - v_line_total then
      raise exception 'Слишком большая сумма заказа';
    end if;

    v_total := v_total + v_line_total;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_product.id,
        'product_name', v_product.name,
        'unit_price', v_product.price,
        'quantity', v_quantity
      )
    );
  end loop;

  insert into public.orders (
    business_id, pickup, pickup_time, customer_name, customer_phone,
    comment, channel, total
  )
  values (
    v_business.id,
    p_pickup,
    case when p_pickup = 'time' then v_pickup_time else null end,
    left(v_name, 80),
    v_phone,
    v_comment,
    p_channel,
    v_total::integer
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
  select
    v_order_id,
    (line->>'product_id')::uuid,
    line->>'product_name',
    (line->>'unit_price')::integer,
    (line->>'quantity')::integer
  from jsonb_array_elements(v_lines) as line;

  select coalesce(sum(line_total)::bigint, 0)
  into v_saved_total
  from public.order_items
  where order_id = v_order_id;

  if v_saved_total is distinct from v_total then
    raise exception 'Сумма заказа не совпадает с позициями';
  end if;

  return v_order_id;
end;
$$;

revoke all on function public.place_order(uuid, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.place_order(uuid, text, text, text, text, text, text, jsonb) to anon, authenticated;

grant insert on table public.businesses to authenticated;

create policy "Superadmin reads businesses"
on public.businesses for select
to authenticated
using (public.is_superadmin());

create policy "Superadmin inserts businesses"
on public.businesses for insert
to authenticated
with check (public.is_superadmin());

create policy "Superadmin updates businesses"
on public.businesses for update
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

create policy "Blocked owner cannot update business"
on public.businesses as restrictive
for update
to authenticated
using (not is_blocked or public.is_superadmin())
with check (not is_blocked or public.is_superadmin());

create policy "Guests only see open demo and active businesses"
on public.businesses as restrictive
for select
to anon
using (status in ('demo', 'active') and not is_blocked);

create policy "Superadmin reads categories"
on public.categories for select
to authenticated
using (public.is_superadmin());

create policy "Superadmin inserts categories"
on public.categories for insert
to authenticated
with check (public.is_superadmin());

create policy "Superadmin updates categories"
on public.categories for update
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

create policy "Superadmin deletes categories"
on public.categories for delete
to authenticated
using (public.is_superadmin());

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
  )
);

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
  )
);

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
  )
);

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
  )
);

create policy "Superadmin reads products"
on public.products for select
to authenticated
using (public.is_superadmin());

create policy "Superadmin inserts products"
on public.products for insert
to authenticated
with check (public.is_superadmin());

create policy "Superadmin updates products"
on public.products for update
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

create policy "Superadmin deletes products"
on public.products for delete
to authenticated
using (public.is_superadmin());

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
  )
);

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
  )
);

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
  )
);

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
  )
);

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
  )
);

create policy "Superadmin reads menu photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products)/[A-Za-z0-9._-]{1,180}$'
  and exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(name))[1]
  )
);

create policy "Superadmin uploads menu photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products)/[A-Za-z0-9._-]{1,180}$'
  and exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(name))[1]
  )
);

create policy "Superadmin replaces menu photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products)/[A-Za-z0-9._-]{1,180}$'
  and exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products)/[A-Za-z0-9._-]{1,180}$'
  and exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(name))[1]
  )
);

create policy "Superadmin deletes menu photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products)/[A-Za-z0-9._-]{1,180}$'
  and exists (
    select 1
    from public.businesses as venue
    where venue.id::text = (storage.foldername(name))[1]
  )
);

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
  )
);

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
  )
);

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
  )
);

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
  )
);
