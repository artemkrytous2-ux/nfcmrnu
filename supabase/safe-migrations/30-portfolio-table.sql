-- NFCMENU safe-migrations / таблица portfolio_photos + RLS
-- Storage НЕ трогает (см. 40-storage-menu-photos-widen.sql).
-- Если таблица уже есть — проверяет ключевые колонки; при несовместимости стоп.
-- Не удаляет данные.

do $$
declare
  missing text[] := array[]::text[];
  col text;
begin
  if to_regclass('public.businesses') is null then
    raise exception 'NFCMENU 30: нет public.businesses — стоп';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_superadmin'
  ) then
    raise exception 'NFCMENU 30: нет is_superadmin() — стоп';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'current_business_id'
  ) then
    raise exception 'NFCMENU 30: нет current_business_id() — стоп';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'is_archived'
  ) then
    raise exception 'NFCMENU 30: нет businesses.is_archived — сначала 25-add-is-archived.sql';
  end if;

  if to_regclass('public.portfolio_photos') is not null then
    foreach col in array array['id', 'business_id', 'image_path', 'sort_order', 'created_at']
    loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'portfolio_photos'
          and column_name = col
      ) then
        missing := missing || array[col];
      end if;
    end loop;

    if cardinality(missing) > 0 then
      raise exception
        'NFCMENU 30: portfolio_photos уже есть, но несовместима (нет колонок: %). Стоп без изменений.',
        array_to_string(missing, ', ');
    end if;

    raise notice 'NFCMENU 30: portfolio_photos уже существует и совместима по колонкам — create пропускаем, политики пересоздадим по имени.';
  end if;
end $$;

create table if not exists public.portfolio_photos (
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

drop policy if exists "Owner reads own portfolio photos" on public.portfolio_photos;
create policy "Owner reads own portfolio photos"
on public.portfolio_photos for select
to authenticated
using (business_id = public.current_business_id());

drop policy if exists "Owner inserts own portfolio photos" on public.portfolio_photos;
create policy "Owner inserts own portfolio photos"
on public.portfolio_photos for insert
to authenticated
with check (business_id = public.current_business_id());

drop policy if exists "Owner updates own portfolio photos" on public.portfolio_photos;
create policy "Owner updates own portfolio photos"
on public.portfolio_photos for update
to authenticated
using (business_id = public.current_business_id())
with check (business_id = public.current_business_id());

drop policy if exists "Owner deletes own portfolio photos" on public.portfolio_photos;
create policy "Owner deletes own portfolio photos"
on public.portfolio_photos for delete
to authenticated
using (business_id = public.current_business_id());

drop policy if exists "Superadmin reads portfolio photos" on public.portfolio_photos;
create policy "Superadmin reads portfolio photos"
on public.portfolio_photos for select
to authenticated
using (public.is_superadmin());

drop policy if exists "Superadmin inserts portfolio photos" on public.portfolio_photos;
create policy "Superadmin inserts portfolio photos"
on public.portfolio_photos for insert
to authenticated
with check (public.is_superadmin());

drop policy if exists "Superadmin updates portfolio photos" on public.portfolio_photos;
create policy "Superadmin updates portfolio photos"
on public.portfolio_photos for update
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "Superadmin deletes portfolio photos" on public.portfolio_photos;
create policy "Superadmin deletes portfolio photos"
on public.portfolio_photos for delete
to authenticated
using (public.is_superadmin());

drop policy if exists "Blocked owner cannot insert portfolio photos" on public.portfolio_photos;
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

drop policy if exists "Blocked owner cannot update portfolio photos" on public.portfolio_photos;
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

drop policy if exists "Blocked owner cannot delete portfolio photos" on public.portfolio_photos;
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

drop policy if exists "Guests read portfolio of open businesses" on public.portfolio_photos;
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

-- ПРОВЕРКА
select
  '30-portfolio-table' as migration,
  to_regclass('public.portfolio_photos') is not null as table_ok,
  (select relrowsecurity from pg_class where oid = 'public.portfolio_photos'::regclass) as rls_on,
  (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'portfolio_photos'
  ) as policy_count;
