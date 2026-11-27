-- NFCMENU safe-migrations / ЭТАП 5a: internal business_messages
-- Внутренние сообщения суперадмина заведениям (не SMS).
-- Зависимости: businesses, is_superadmin, current_business_id, set_updated_at не требуется.
-- Данные не удаляются. Владелец видит только свои строки.

do $$
begin
  if to_regclass('public.businesses') is null then
    raise exception 'NFCMENU 53: нет public.businesses — стоп';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_superadmin'
  ) then
    raise exception 'NFCMENU 53: нет is_superadmin() — стоп';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'current_business_id'
  ) then
    raise exception 'NFCMENU 53: нет current_business_id() — стоп';
  end if;
end $$;

create table if not exists public.business_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null
    constraint business_messages_title_length
    check (char_length(trim(title)) between 1 and 120),
  body text not null
    constraint business_messages_body_length
    check (char_length(trim(body)) between 1 and 4000),
  broadcast_id uuid,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists business_messages_business_created_idx
  on public.business_messages (business_id, created_at desc);

create index if not exists business_messages_business_unread_idx
  on public.business_messages (business_id)
  where read_at is null;

create index if not exists business_messages_broadcast_idx
  on public.business_messages (broadcast_id)
  where broadcast_id is not null;

create or replace function public.lock_business_message_owner_write()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null and not public.is_superadmin() then
      raise exception 'Удалять сообщения может только администратор NFCMENU';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_superadmin() then
      raise exception 'Отправлять сообщения может только администратор NFCMENU';
    end if;
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    new.read_at := null;
    return new;
  end if;

  -- UPDATE: владелец может только поставить read_at (прочтение).
  if auth.uid() is not null and not public.is_superadmin() then
    if old.business_id is distinct from new.business_id
      or old.title is distinct from new.title
      or old.body is distinct from new.body
      or old.broadcast_id is distinct from new.broadcast_id
      or old.created_by is distinct from new.created_by
      or old.created_at is distinct from new.created_at
    then
      raise exception 'Владелец может только отметить сообщение прочитанным';
    end if;
    if old.read_at is not null and new.read_at is distinct from old.read_at then
      raise exception 'Прочитанное сообщение нельзя изменить';
    end if;
    if new.read_at is null then
      raise exception 'Можно только отметить сообщение прочитанным';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.lock_business_message_owner_write() from public, anon, authenticated;
grant execute on function public.lock_business_message_owner_write() to authenticated, service_role;

drop trigger if exists business_messages_lock_owner_write on public.business_messages;
create trigger business_messages_lock_owner_write
before insert or update or delete on public.business_messages
for each row execute function public.lock_business_message_owner_write();

alter table public.business_messages enable row level security;

revoke all on table public.business_messages from public, anon;
grant select, update on table public.business_messages to authenticated;
grant insert, delete on table public.business_messages to authenticated;
grant select, insert, update, delete on table public.business_messages to service_role;

drop policy if exists "Owner reads own business messages" on public.business_messages;
create policy "Owner reads own business messages"
on public.business_messages for select
to authenticated
using (
  business_id = public.current_business_id()
  or public.is_superadmin()
);

drop policy if exists "Superadmin inserts business messages" on public.business_messages;
create policy "Superadmin inserts business messages"
on public.business_messages for insert
to authenticated
with check (public.is_superadmin());

drop policy if exists "Owner marks own messages read" on public.business_messages;
create policy "Owner marks own messages read"
on public.business_messages for update
to authenticated
using (
  business_id = public.current_business_id()
  or public.is_superadmin()
)
with check (
  business_id = public.current_business_id()
  or public.is_superadmin()
);

drop policy if exists "Superadmin deletes business messages" on public.business_messages;
create policy "Superadmin deletes business messages"
on public.business_messages for delete
to authenticated
using (public.is_superadmin());

select
  '53-business-messages' as migration,
  to_regclass('public.business_messages') is not null as table_ok,
  (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'business_messages'
  ) as policy_count;
