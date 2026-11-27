-- NFCMENU safe-migrations / ЭТАП 5b: business_subscription_events
-- Неизменяемая история изменений срока подписки.
-- Зависимости: 51-business-subscriptions, is_superadmin, current_business_id.
-- Не создаёт вторую систему подписок — только журнал к business_subscriptions.

do $$
begin
  if to_regclass('public.business_subscriptions') is null then
    raise exception 'NFCMENU 54: нет business_subscriptions — сначала 51-business-subscriptions.sql';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_superadmin'
  ) then
    raise exception 'NFCMENU 54: нет is_superadmin() — стоп';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'current_business_id'
  ) then
    raise exception 'NFCMENU 54: нет current_business_id() — стоп';
  end if;
end $$;

create table if not exists public.business_subscription_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  subscription_id uuid not null references public.business_subscriptions (id) on delete cascade,
  action text not null
    constraint business_subscription_events_action_check
    check (action in ('assign', 'extend', 'set_ends_at')),
  plan_code text
    constraint business_subscription_events_plan_code_check
    check (plan_code is null or plan_code in ('month_990', 'months6_5490')),
  plan_amount_rub integer
    constraint business_subscription_events_plan_amount_check
    check (plan_amount_rub is null or plan_amount_rub in (990, 5490)),
  plan_duration_months integer
    constraint business_subscription_events_plan_duration_check
    check (plan_duration_months is null or plan_duration_months in (1, 6)),
  prev_starts_at timestamptz,
  prev_ends_at timestamptz,
  prev_status text,
  new_starts_at timestamptz not null,
  new_ends_at timestamptz not null,
  new_status text not null
    constraint business_subscription_events_new_status_check
    check (new_status in ('active', 'expired', 'cancelled')),
  source text not null
    constraint business_subscription_events_source_check
    check (source in ('manual', 'robokassa')),
  payment_provider text not null default ''
    constraint business_subscription_events_payment_provider_length
    check (char_length(payment_provider) <= 40),
  payment_external_id text not null default ''
    constraint business_subscription_events_payment_external_id_length
    check (char_length(payment_external_id) <= 120),
  activation_request_id uuid references public.activation_requests (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  notes text not null default ''
    constraint business_subscription_events_notes_length
    check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  constraint business_subscription_events_dates check (new_ends_at > new_starts_at)
);

create index if not exists business_subscription_events_business_created_idx
  on public.business_subscription_events (business_id, created_at desc);

create index if not exists business_subscription_events_subscription_created_idx
  on public.business_subscription_events (subscription_id, created_at desc);

-- Идемпотентность: одна заявка активации / один внешний платёж — одна запись в журнале.
drop index if exists public.business_subscription_events_activation_request_uidx;
create unique index business_subscription_events_activation_request_uidx
  on public.business_subscription_events (activation_request_id)
  where activation_request_id is not null;

drop index if exists public.business_subscription_events_payment_external_uidx;
create unique index business_subscription_events_payment_external_uidx
  on public.business_subscription_events (payment_external_id)
  where payment_external_id <> '';

-- Доп. защита на подписках: один внешний платёж не создаёт вторую подписку.
drop index if exists public.business_subscriptions_payment_external_uidx;
create unique index business_subscriptions_payment_external_uidx
  on public.business_subscriptions (payment_external_id)
  where payment_external_id <> '';

create or replace function public.lock_business_subscription_events_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'История подписки неизменяема';
  end if;

  if tg_op = 'DELETE' then
    if auth.uid() is not null and not public.is_superadmin() then
      raise exception 'Удалять историю подписки может только администратор NFCMENU';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_superadmin() then
      raise exception 'Писать историю подписки может только администратор NFCMENU';
    end if;
    return new;
  end if;

  return new;
end;
$$;

revoke all on function public.lock_business_subscription_events_immutable() from public, anon, authenticated;
grant execute on function public.lock_business_subscription_events_immutable() to authenticated, service_role;

drop trigger if exists business_subscription_events_immutable on public.business_subscription_events;
create trigger business_subscription_events_immutable
before insert or update or delete on public.business_subscription_events
for each row execute function public.lock_business_subscription_events_immutable();

alter table public.business_subscription_events enable row level security;

revoke all on table public.business_subscription_events from public, anon;
grant select on table public.business_subscription_events to authenticated;
grant insert, delete on table public.business_subscription_events to authenticated;
grant select, insert, update, delete on table public.business_subscription_events to service_role;

drop policy if exists "Owner reads own subscription events" on public.business_subscription_events;
create policy "Owner reads own subscription events"
on public.business_subscription_events for select
to authenticated
using (
  business_id = public.current_business_id()
  or public.is_superadmin()
);

drop policy if exists "Superadmin inserts subscription events" on public.business_subscription_events;
create policy "Superadmin inserts subscription events"
on public.business_subscription_events for insert
to authenticated
with check (public.is_superadmin());

drop policy if exists "Superadmin deletes subscription events" on public.business_subscription_events;
create policy "Superadmin deletes subscription events"
on public.business_subscription_events for delete
to authenticated
using (public.is_superadmin());

select
  '54-subscription-events' as migration,
  to_regclass('public.business_subscription_events') is not null as table_ok,
  (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'business_subscription_events'
  ) as policy_count;
