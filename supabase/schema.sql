-- NFCMENU: заведения, меню, заказы, фото и RLS.
-- Один владелец — одно заведение. Сотрудников нет.
-- Владельца и заведение создаёт администратор NFCMENU в Supabase.
-- Этот сценарий рассчитан на первый запуск.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to authenticated;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text not null default '',
  address text not null default '',
  phone text not null default '',
  hours text not null default '',
  order_phone text not null default '',
  banner_path text not null default '',
  telegram_enabled boolean not null default true,
  max_enabled boolean not null default true,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_description_length check (char_length(description) <= 2000),
  constraint businesses_address_length check (char_length(address) <= 300),
  constraint businesses_phone_length check (char_length(phone) <= 40),
  constraint businesses_hours_length check (char_length(hours) <= 120),
  constraint businesses_order_phone_length check (char_length(order_phone) <= 40),
  constraint businesses_banner_path_length check (char_length(banner_path) <= 240)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete no action deferrable initially deferred,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text not null default '',
  price integer not null check (price >= 0 and price <= 1000000),
  image_path text not null default '',
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_description_length check (char_length(description) <= 2000),
  constraint products_image_path_length check (char_length(image_path) <= 240)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  status text not null default 'new' check (status in ('new', 'accepted', 'done', 'cancelled')),
  pickup text not null check (pickup in ('now', 'soon', 'time')),
  pickup_time text,
  customer_name text not null check (char_length(trim(customer_name)) between 2 and 80),
  customer_phone text not null check (
    char_length(trim(customer_phone)) between 11 and 20
    and char_length(regexp_replace(customer_phone, '\D', '', 'g')) >= 11
  ),
  comment text not null default '' check (char_length(comment) <= 500),
  channel text not null check (channel in ('telegram', 'max')),
  total integer not null check (total >= 0),
  created_at timestamptz not null default now(),
  constraint orders_pickup_time_length check (pickup_time is null or char_length(pickup_time) <= 40)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null check (char_length(product_name) between 1 and 120),
  unit_price integer not null check (unit_price >= 0 and unit_price <= 1000000),
  quantity integer not null check (quantity between 1 and 99),
  line_total integer generated always as (unit_price * quantity) stored
);

create index categories_business_sort_idx on public.categories (business_id, sort_order);
create index products_business_category_idx on public.products (business_id, category_id, sort_order);
create index products_visible_idx on public.products (business_id) where is_visible;
create index orders_business_created_idx on public.orders (business_id, created_at desc);
create index order_items_order_idx on public.order_items (order_id);

create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select id
  from public.businesses
  where owner_id = auth.uid()
$$;

revoke all on function public.current_business_id() from public, anon, authenticated;
grant execute on function public.current_business_id() to authenticated;

create or replace function public.lock_business_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is not null and (
    new.owner_id is distinct from old.owner_id
    or new.slug is distinct from old.slug
    or new.is_published is distinct from old.is_published
  ) then
    raise exception 'Адрес страницы, владельца и публикацию меняет только администратор NFCMENU';
  end if;
  return new;
end;
$$;

revoke all on function public.lock_business_identity() from public, anon, authenticated;
grant execute on function public.lock_business_identity() to authenticated;

create or replace function public.enforce_product_business()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  category_business uuid;
begin
  select business_id into category_business
  from public.categories
  where id = new.category_id;

  if category_business is null or category_business <> new.business_id then
    raise exception 'Категория не принадлежит этому заведению';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_product_business() from public, anon, authenticated;
grant execute on function public.enforce_product_business() to authenticated;

create trigger businesses_lock_identity
before update on public.businesses
for each row execute function public.lock_business_identity();

create trigger businesses_updated_at
before update on public.businesses
for each row execute function public.set_updated_at();

create trigger categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger products_same_business
before insert or update on public.products
for each row execute function public.enforce_product_business();

alter table public.businesses enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "Guests read published businesses"
on public.businesses for select
to anon
using (is_published);

create policy "Owner reads own business"
on public.businesses for select
to authenticated
using (owner_id = auth.uid());

create policy "Owner updates own business"
on public.businesses for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Guests read categories of published menus"
on public.categories for select
to anon
using (
  exists (
    select 1
    from public.businesses
    where businesses.id = categories.business_id
      and businesses.is_published
  )
);

create policy "Owner reads own categories"
on public.categories for select
to authenticated
using (business_id = public.current_business_id());

create policy "Owner inserts own categories"
on public.categories for insert
to authenticated
with check (business_id = public.current_business_id());

create policy "Owner updates own categories"
on public.categories for update
to authenticated
using (business_id = public.current_business_id())
with check (business_id = public.current_business_id());

create policy "Owner deletes own categories"
on public.categories for delete
to authenticated
using (business_id = public.current_business_id());

create policy "Guests read visible products"
on public.products for select
to anon
using (
  is_visible
  and exists (
    select 1
    from public.businesses
    where businesses.id = products.business_id
      and businesses.is_published
  )
);

create policy "Owner reads own products"
on public.products for select
to authenticated
using (business_id = public.current_business_id());

create policy "Owner inserts own products"
on public.products for insert
to authenticated
with check (business_id = public.current_business_id());

create policy "Owner updates own products"
on public.products for update
to authenticated
using (business_id = public.current_business_id())
with check (business_id = public.current_business_id());

create policy "Owner deletes own products"
on public.products for delete
to authenticated
using (business_id = public.current_business_id());

create policy "Owner reads own orders"
on public.orders for select
to authenticated
using (business_id = public.current_business_id());

create policy "Owner updates own order status"
on public.orders for update
to authenticated
using (business_id = public.current_business_id())
with check (
  business_id = public.current_business_id()
  and status in ('new', 'accepted', 'done', 'cancelled')
);

create policy "Owner reads own order items"
on public.order_items for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.business_id = public.current_business_id()
  )
);

grant select on public.businesses, public.categories, public.products to anon;
grant select, update on public.businesses to authenticated;
grant select, insert, update, delete on public.categories, public.products to authenticated;

revoke all on public.orders from anon;
revoke insert, delete on public.orders from authenticated;
revoke update on public.orders from authenticated;
grant select on public.orders to authenticated;
grant update (status) on public.orders to authenticated;

revoke all on public.order_items from anon;
revoke insert, update, delete on public.order_items from authenticated;
grant select on public.order_items to authenticated;

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-photos',
  'menu-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Guests read published menu photos"
on storage.objects for select
to anon
using (
  bucket_id = 'menu-photos'
  and (storage.foldername(name))[1] in (
    select businesses.id::text
    from public.businesses
    where businesses.is_published
  )
);

create policy "Owner reads own menu photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'menu-photos'
  and (storage.foldername(name))[1] = public.current_business_id()::text
);

create policy "Owner uploads own menu photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'menu-photos'
  and name ~ (
    '^' || public.current_business_id()::text || '/(banner|products)/[A-Za-z0-9._-]{1,180}$'
  )
);

create policy "Owner replaces own menu photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'menu-photos'
  and name ~ (
    '^' || public.current_business_id()::text || '/(banner|products)/[A-Za-z0-9._-]{1,180}$'
  )
)
with check (
  bucket_id = 'menu-photos'
  and name ~ (
    '^' || public.current_business_id()::text || '/(banner|products)/[A-Za-z0-9._-]{1,180}$'
  )
);

create policy "Owner deletes own menu photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'menu-photos'
  and name ~ (
    '^' || public.current_business_id()::text || '/(banner|products)/[A-Za-z0-9._-]{1,180}$'
  )
);
