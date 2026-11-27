-- NFCMENU safe-migrations / ЭТАП 4b: business_subscriptions
-- Зависимости: 50-activation-requests, businesses, is_superadmin, set_updated_at, current_business_id.
-- Владелец только читает; писать может суперадмин. Данные не удаляются этим файлом.

do $$
declare
  missing text[] := array[]::text[];
  col text;
  required text[] := array[
    'id', 'business_id', 'plan_code', 'plan_amount_rub', 'plan_duration_months',
    'starts_at', 'ends_at', 'status', 'source', 'payment_provider',
    'payment_external_id', 'activation_request_id', 'notes',
    'created_at', 'updated_at'
  ];
begin
  if to_regclass('public.businesses') is null then
    raise exception 'NFCMENU 51: нет public.businesses — стоп';
  end if;

  if to_regclass('public.activation_requests') is null then
    raise exception 'NFCMENU 51: нет activation_requests — сначала 50-activation-requests.sql';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    raise exception 'NFCMENU 51: нет set_updated_at() — стоп';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_superadmin'
  ) then
    raise exception 'NFCMENU 51: нет is_superadmin() — стоп';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'current_business_id'
  ) then
    raise exception 'NFCMENU 51: нет current_business_id() — стоп';
  end if;

  if to_regclass('public.business_subscriptions') is not null then
    foreach col in array required
    loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'business_subscriptions'
          and column_name = col
      ) then
        missing := missing || array[col];
      end if;
    end loop;

    if cardinality(missing) > 0 then
      raise exception
        'NFCMENU 51: business_subscriptions уже есть, но несовместима (нет: %). Стоп.',
        array_to_string(missing, ', ');
    end if;

    raise notice 'NFCMENU 51: таблица есть — create пропускаем, обновим функции/политики/индексы.';
  end if;
end $$;

create table if not exists public.business_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  plan_code text not null
    constraint business_subscriptions_plan_code_check
    check (plan_code in ('month_990', 'months6_5490')),
  plan_amount_rub integer not null
    constraint business_subscriptions_plan_amount_check
    check (plan_amount_rub in (990, 5490)),
  plan_duration_months integer not null
    constraint business_subscriptions_plan_duration_check
    check (plan_duration_months in (1, 6)),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active'
    constraint business_subscriptions_status_check
    check (status in ('active', 'expired', 'cancelled')),
  source text not null default 'manual'
    constraint business_subscriptions_source_check
    check (source in ('manual', 'robokassa')),
  payment_provider text not null default ''
    constraint business_subscriptions_payment_provider_length
    check (char_length(payment_provider) <= 40),
  payment_external_id text not null default ''
    constraint business_subscriptions_payment_external_id_length
    check (char_length(payment_external_id) <= 120),
  activation_request_id uuid references public.activation_requests (id) on delete set null,
  notes text not null default ''
    constraint business_subscriptions_notes_length
    check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_subscriptions_plan_match check (
    (plan_code = 'month_990' and plan_amount_rub = 990 and plan_duration_months = 1)
    or (plan_code = 'months6_5490' and plan_amount_rub = 5490 and plan_duration_months = 6)
  ),
  constraint business_subscriptions_dates check (ends_at > starts_at)
);

create index if not exists business_subscriptions_business_ends_idx
  on public.business_subscriptions (business_id, ends_at desc);

create index if not exists business_subscriptions_active_ends_idx
  on public.business_subscriptions (ends_at)
  where status = 'active';

drop index if exists public.business_subscriptions_one_active_per_business_idx;
create unique index business_subscriptions_one_active_per_business_idx
  on public.business_subscriptions (business_id)
  where status = 'active';

drop index if exists public.business_subscriptions_activation_request_uidx;
create unique index business_subscriptions_activation_request_uidx
  on public.business_subscriptions (activation_request_id)
  where activation_request_id is not null;

drop trigger if exists business_subscriptions_set_updated_at on public.business_subscriptions;
create trigger business_subscriptions_set_updated_at
before update on public.business_subscriptions
for each row execute function public.set_updated_at();

create or replace function public.lock_business_subscription_fields()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is not null and not public.is_superadmin() then
    raise exception 'Подписку назначает только администратор NFCMENU';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.lock_business_subscription_fields() from public, anon, authenticated;
grant execute on function public.lock_business_subscription_fields() to authenticated, service_role;

drop trigger if exists business_subscriptions_lock_fields on public.business_subscriptions;
create trigger business_subscriptions_lock_fields
before insert or update or delete on public.business_subscriptions
for each row execute function public.lock_business_subscription_fields();

alter table public.business_subscriptions enable row level security;

revoke all on table public.business_subscriptions from public, anon;
grant select on table public.business_subscriptions to authenticated;
grant insert, update, delete on table public.business_subscriptions to authenticated;
-- service_role: INSERT подписки при activatePaidRequest (auth.uid() IS NULL → lock пропускает).
grant select, insert, update, delete on table public.business_subscriptions to service_role;

drop policy if exists "Owner reads own business subscriptions" on public.business_subscriptions;
create policy "Owner reads own business subscriptions"
on public.business_subscriptions for select
to authenticated
using (
  business_id = public.current_business_id()
  or public.is_superadmin()
);

drop policy if exists "Superadmin inserts business subscriptions" on public.business_subscriptions;
create policy "Superadmin inserts business subscriptions"
on public.business_subscriptions for insert
to authenticated
with check (public.is_superadmin());

drop policy if exists "Superadmin updates business subscriptions" on public.business_subscriptions;
create policy "Superadmin updates business subscriptions"
on public.business_subscriptions for update
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "Superadmin deletes business subscriptions" on public.business_subscriptions;
create policy "Superadmin deletes business subscriptions"
on public.business_subscriptions for delete
to authenticated
using (public.is_superadmin());

-- ПРОВЕРКА
select
  '51-business-subscriptions' as migration,
  to_regclass('public.business_subscriptions') is not null as table_ok,
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lock_business_subscription_fields'
  ) as lock_fn_ok,
  (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'business_subscriptions'
  ) as policy_count;
