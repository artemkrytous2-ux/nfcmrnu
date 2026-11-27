-- NFCMENU safe-migrations / ЭТАП 4a: activation_requests
-- Соответствует актуальному коду /try и /superadmin (contact_phone, cancelled, планы month_990/months6_5490).
-- Если таблица уже есть — проверяет колонки; при несовместимости СТОП.
-- Не удаляет строки. Не трогает menu-photos.

do $$
declare
  missing text[] := array[]::text[];
  col text;
  required text[] := array[
    'id', 'user_id', 'demo_payload', 'plan_code', 'plan_amount_rub',
    'plan_duration_months', 'desired_slug', 'contact_phone', 'status',
    'business_id', 'error_message', 'activated_at', 'created_at', 'updated_at'
  ];
begin
  if to_regclass('public.businesses') is null then
    raise exception 'NFCMENU 50: нет public.businesses — стоп';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    raise exception 'NFCMENU 50: нет set_updated_at() — стоп';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_superadmin'
  ) then
    raise exception 'NFCMENU 50: нет is_superadmin() — стоп';
  end if;

  if to_regclass('public.activation_requests') is not null then
    foreach col in array required
    loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'activation_requests'
          and column_name = col
      ) then
        missing := missing || array[col];
      end if;
    end loop;

    if cardinality(missing) > 0 then
      raise exception
        'NFCMENU 50: activation_requests уже существует, но несовместима (нет: %). Стоп. Не пересоздаём таблицу.',
        array_to_string(missing, ', ');
    end if;

    raise notice 'NFCMENU 50: таблица есть и совместима по колонкам — create пропускаем, обновим функции/политики/индексы.';
  end if;
end $$;

create table if not exists public.activation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  demo_payload jsonb not null default '{}'::jsonb,
  plan_code text not null
    constraint activation_requests_plan_code_check
    check (plan_code in ('month_990', 'months6_5490')),
  plan_amount_rub integer not null
    constraint activation_requests_plan_amount_check
    check (plan_amount_rub in (990, 5490)),
  plan_duration_months integer not null
    constraint activation_requests_plan_duration_check
    check (plan_duration_months in (1, 6)),
  desired_slug text not null
    constraint activation_requests_desired_slug_check
    check (desired_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(desired_slug) between 2 and 64),
  contact_phone text not null
    constraint activation_requests_contact_phone_check
    check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'pending'
    constraint activation_requests_status_check
    check (status in ('pending', 'processing', 'activated', 'failed', 'cancelled')),
  business_id uuid unique references public.businesses (id) on delete set null,
  error_message text not null default ''
    constraint activation_requests_error_message_length
    check (char_length(error_message) <= 2000),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activation_requests_plan_match check (
    (plan_code = 'month_990' and plan_amount_rub = 990 and plan_duration_months = 1)
    or (plan_code = 'months6_5490' and plan_amount_rub = 5490 and plan_duration_months = 6)
  ),
  constraint activation_requests_activated_state check (
    (
      status = 'activated'
      and business_id is not null
      and activated_at is not null
    )
    or status <> 'activated'
  ),
  constraint activation_requests_failed_has_error check (
    status <> 'failed'
    or char_length(trim(error_message)) > 0
  ),
  constraint activation_requests_cancelled_state check (
    status <> 'cancelled'
    or (business_id is null and activated_at is null)
  ),
  constraint activation_requests_payload_size check (
    pg_column_size(demo_payload) <= 524288
  ),
  constraint activation_requests_no_data_urls check (
    position('data:image' in lower(demo_payload::text)) = 0
  )
);

comment on table public.activation_requests is
  'Заявки пользователя на перенос персональной демоверсии после ручной проверки оплаты.';

create index if not exists activation_requests_user_created_idx
  on public.activation_requests (user_id, created_at desc);

create index if not exists activation_requests_status_created_idx
  on public.activation_requests (status, created_at desc);

drop index if exists public.activation_requests_one_open_per_user_idx;
create unique index activation_requests_one_open_per_user_idx
  on public.activation_requests (user_id)
  where status in ('pending', 'processing');

drop trigger if exists activation_requests_set_updated_at on public.activation_requests;
create trigger activation_requests_set_updated_at
before update on public.activation_requests
for each row execute function public.set_updated_at();

create or replace function public.lock_activation_request_fields()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_superadmin() then
      new.user_id := auth.uid();
      new.status := 'pending';
      new.business_id := null;
      new.activated_at := null;
      new.error_message := '';

      if exists (
        select 1 from public.businesses as venue
        where venue.owner_id = auth.uid()
      ) then
        raise exception 'У вас уже есть заведение NFCMENU';
      end if;
    end if;
    return new;
  end if;

  if auth.uid() is not null and not public.is_superadmin() then
    if old.user_id is distinct from auth.uid() then
      raise exception 'Можно менять только свою заявку';
    end if;

    new.user_id := old.user_id;

    if new.plan_code is distinct from old.plan_code
       or new.plan_amount_rub is distinct from old.plan_amount_rub
       or new.plan_duration_months is distinct from old.plan_duration_months then
      raise exception 'Тариф заявки меняет только администратор NFCMENU';
    end if;

    if new.contact_phone is distinct from old.contact_phone then
      raise exception 'Телефон заявки меняет только администратор NFCMENU';
    end if;

    new.plan_code := old.plan_code;
    new.plan_amount_rub := old.plan_amount_rub;
    new.plan_duration_months := old.plan_duration_months;
    new.contact_phone := old.contact_phone;

    if old.status is distinct from 'pending' then
      raise exception 'Заявку после начала обработки меняет только администратор NFCMENU';
    end if;

    if new.status is distinct from old.status
       and new.status is distinct from 'cancelled' then
      raise exception 'Отменить заявку можно статусом cancelled; активацию выполняет администратор NFCMENU';
    end if;

    if new.status = 'cancelled' then
      new.business_id := null;
      new.activated_at := null;
      new.error_message := '';
    end if;

    if new.business_id is distinct from old.business_id
       or new.activated_at is distinct from old.activated_at then
      raise exception 'Привязку заведения выполняет только администратор NFCMENU';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.lock_activation_request_fields() from public, anon, authenticated;
grant execute on function public.lock_activation_request_fields() to authenticated, service_role;

drop trigger if exists activation_requests_lock_fields on public.activation_requests;
create trigger activation_requests_lock_fields
before insert or update on public.activation_requests
for each row execute function public.lock_activation_request_fields();

alter table public.activation_requests enable row level security;

revoke all on table public.activation_requests from public, anon;
grant select, insert, update on table public.activation_requests to authenticated;
grant delete on table public.activation_requests to authenticated;
-- service_role: оркестратор активации (pending→processing→activated) обходит RLS, но нужен table GRANT.
grant select, insert, update, delete on table public.activation_requests to service_role;

drop policy if exists "Owner reads own activation requests" on public.activation_requests;
create policy "Owner reads own activation requests"
on public.activation_requests for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Owner inserts own activation requests" on public.activation_requests;
create policy "Owner inserts own activation requests"
on public.activation_requests for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Owner updates own pending activation requests" on public.activation_requests;
create policy "Owner updates own pending activation requests"
on public.activation_requests for update
to authenticated
using (user_id = auth.uid() and status = 'pending')
with check (user_id = auth.uid() and status in ('pending', 'cancelled'));

drop policy if exists "Superadmin reads activation requests" on public.activation_requests;
create policy "Superadmin reads activation requests"
on public.activation_requests for select
to authenticated
using (public.is_superadmin());

drop policy if exists "Superadmin inserts activation requests" on public.activation_requests;
create policy "Superadmin inserts activation requests"
on public.activation_requests for insert
to authenticated
with check (public.is_superadmin());

drop policy if exists "Superadmin updates activation requests" on public.activation_requests;
create policy "Superadmin updates activation requests"
on public.activation_requests for update
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "Superadmin deletes activation requests" on public.activation_requests;
create policy "Superadmin deletes activation requests"
on public.activation_requests for delete
to authenticated
using (public.is_superadmin());

-- ПРОВЕРКА
select
  '50-activation-requests' as migration,
  to_regclass('public.activation_requests') is not null as table_ok,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activation_requests' and column_name = 'contact_phone'
  ) as contact_phone_ok,
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lock_activation_request_fields'
  ) as lock_fn_ok,
  (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'activation_requests'
  ) as policy_count;
