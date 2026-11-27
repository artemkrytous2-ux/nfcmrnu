-- NFCMENU: заявки на ручную активацию персональной демоверсии и учёт подписок.
-- Запускать вручную в SQL Editor после supabase/archive.sql
-- (нужны is_superadmin, status/is_archived у businesses, partial unique owner_id).
-- Этот файл не изменяет schema.sql, superadmin.sql, archive.sql и остальные SQL-файлы.
-- Не отключает RLS. service_role в браузер не выдаётся. Таблицу payments не создаёт.
--
-- Тарифы только:
--   month_990      — 990 ₽ / 1 месяц
--   months6_5490   — 5 490 ₽ / 6 месяцев
-- Старый 2 970 ₽ / 3 месяца не используется.
--
-- Статусы заявки и переходы:
--   pending     — заявка создана; ждёт ручной проверки оплаты
--   processing  — суперадмин начал перенос (только SA / service_role)
--   activated   — заведение создано, подписка назначена (только SA / service_role)
--   failed      — техническая ошибка переноса (только SA / service_role)
--   cancelled   — пользователь отменил заявку, пока она pending
-- Владелец: pending → cancelled. Тариф и contact_phone после INSERT владелец не меняет.
-- Суперадмин может сменить тариф и исправить телефон при ручной активации.
-- Telegram для заявки не требуется.
--
-- Фотографии демоверсии НЕ хранить как data URL / base64 в JSONB.
-- Клиент после создания заявки загружает файлы в bucket activation-media
-- по пути {request_id}/(banner|products|pwa-icon)/{файл}, а в demo_payload
-- оставляет только текстовые пути Storage (или пустые строки / https URL).
-- После активации сервер (service_role) копирует объекты в menu-photos/{business_id}/...
-- После cancelled владелец может удалить свои файлы заявки; загрузка/замена — только pending.
--
-- Повторный запуск: CREATE TABLE без IF NOT EXISTS — при уже существующей таблице
-- миграция остановится явно (не скрываем чужую структуру). Политики, индексы,
-- триггеры и bucket пересоздаются безопасно (drop + create / on conflict).
-- Перед продом сверьте живые политики storage.objects, как в portfolio-photos.sql.

-- ---------------------------------------------------------------------------
-- 1. Заявки на активацию
-- ---------------------------------------------------------------------------

create table public.activation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Снимок демоверсии без тяжёлых изображений (см. комментарий выше).
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
  -- Обязательный телефон владельца в международном формате (+79991234567).
  contact_phone text not null
    constraint activation_requests_contact_phone_check
    check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'pending'
    constraint activation_requests_status_check
    check (status in ('pending', 'processing', 'activated', 'failed', 'cancelled')),
  -- Заполняется только при успешной активации суперадмином / серверным API.
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
  -- failed — только техническая ошибка переноса; текст ошибки обязателен.
  constraint activation_requests_failed_has_error check (
    status <> 'failed'
    or char_length(trim(error_message)) > 0
  ),
  -- cancelled — отмена пользователем; без business_id и без activated_at.
  constraint activation_requests_cancelled_state check (
    status <> 'cancelled'
    or (business_id is null and activated_at is null)
  ),
  -- Защита от раздувания JSONB (в т.ч. случайных data URL).
  constraint activation_requests_payload_size check (
    pg_column_size(demo_payload) <= 524288
  ),
  constraint activation_requests_no_data_urls check (
    position('data:image' in lower(demo_payload::text)) = 0
  )
);

comment on table public.activation_requests is
  'Заявки пользователя на перенос персональной демоверсии в реальное заведение после ручной проверки оплаты.';
comment on column public.activation_requests.demo_payload is
  'JSONB-снимок демо (venue/menu/theme). Пути фото — объекты activation-media, не base64.';
comment on column public.activation_requests.plan_code is
  'Код тарифа: month_990 или months6_5490. После INSERT владелец не меняет; суперадмин может сменить при активации.';
comment on column public.activation_requests.desired_slug is
  'Желаемый публичный адрес; уникальность относительно businesses.slug проверяет API при активации.';
comment on column public.activation_requests.contact_phone is
  'Обязательный телефон владельца (+79991234567). После INSERT владелец не меняет; суперадмин может исправить.';
comment on column public.activation_requests.status is
  'pending → processing → activated | failed; либо pending → cancelled. failed ≠ cancelled.';
comment on column public.activation_requests.business_id is
  'Созданное заведение после успешной активации; уникально, чтобы не активировать дважды.';
comment on column public.activation_requests.error_message is
  'Текст технической ошибки при status = failed. При создании/отмене владельцем очищается.';

drop index if exists public.activation_requests_user_created_idx;
create index activation_requests_user_created_idx
  on public.activation_requests (user_id, created_at desc);

drop index if exists public.activation_requests_status_created_idx;
create index activation_requests_status_created_idx
  on public.activation_requests (status, created_at desc);

-- Одна открытая заявка на пользователя (cancelled/failed/activated слот освобождают).
drop index if exists public.activation_requests_one_open_per_user_idx;
create unique index activation_requests_one_open_per_user_idx
  on public.activation_requests (user_id)
  where status in ('pending', 'processing');

drop trigger if exists activation_requests_set_updated_at on public.activation_requests;
create trigger activation_requests_set_updated_at
before update on public.activation_requests
for each row execute function public.set_updated_at();

-- Владелец: не активирует, не меняет тариф и телефон после отправки, failed недоступен.
-- Суперадмин: полный контроль, в т.ч. смена тарифа и правка contact_phone.
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
        select 1
        from public.businesses as venue
        where venue.owner_id = auth.uid()
      ) then
        raise exception 'У вас уже есть заведение NFCMENU';
      end if;
    end if;

    return new;
  end if;

  -- UPDATE
  if auth.uid() is not null and not public.is_superadmin() then
    if old.user_id is distinct from auth.uid() then
      raise exception 'Можно менять только свою заявку';
    end if;

    new.user_id := old.user_id;

    -- Тариф и телефон фиксируются в момент INSERT; меняет только суперадмин.
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

    -- Владелец: остаться в pending (снимок/slug) или отменить → cancelled.
    -- failed / processing / activated недоступны.
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
-- delete только суперадмину (политика ниже); grant нужен для RLS-пути.
grant delete on table public.activation_requests to authenticated;

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

-- ---------------------------------------------------------------------------
-- 2. Подписки заведений (отдельная таблица, не колонки businesses)
-- ---------------------------------------------------------------------------
-- Почему отдельная таблица, а не поля в businesses:
-- - история продлений и смена тарифа без потери прошлых периодов;
-- - ручное продление = новая строка или смена ends_at с аудитом;
-- - будущая Робокасса: source/payment_* без переделки businesses;
-- - businesses.owner_id уже unique — дублировать «текущий тариф» там не нужно.
-- Текущая подписка: status = 'active', один ряд на business_id (partial unique).
-- Таблица payments отложена до интеграции Робокассы.

create table public.business_subscriptions (
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
  -- manual сейчас; robokassa — для будущих автоплатежей без смены схемы.
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

comment on table public.business_subscriptions is
  'Подписки заведений: тариф, период, статус. Ручное продление и будущая Робокасса.';
comment on column public.business_subscriptions.source is
  'manual — активация/продление суперадмином; robokassa — будущий платёжный провайдер.';
comment on column public.business_subscriptions.payment_external_id is
  'Внешний ID платежа/счёта Робокассы (или пусто для manual).';

drop index if exists public.business_subscriptions_business_ends_idx;
create index business_subscriptions_business_ends_idx
  on public.business_subscriptions (business_id, ends_at desc);

drop index if exists public.business_subscriptions_active_ends_idx;
create index business_subscriptions_active_ends_idx
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

-- Владелец не назначает себе оплаченный тариф.
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
-- Владелец только читает свою подписку; писать может суперадмин (и service_role в API).
grant select on table public.business_subscriptions to authenticated;
grant insert, update, delete on table public.business_subscriptions to authenticated;

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

-- ---------------------------------------------------------------------------
-- 3. Storage: приватный bucket для фото заявок (до появления business_id)
-- ---------------------------------------------------------------------------
-- menu-photos требует UUID заведения в первом сегменте пути — до активации
-- его нет. Отдельный bucket не ломает существующие политики menu-photos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'activation-media',
  'activation-media',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- SELECT: свои файлы в любом статусе заявки (в т.ч. cancelled / failed).
drop policy if exists "Owner reads own activation media" on storage.objects;
create policy "Owner reads own activation media"
on storage.objects for select
to authenticated
using (
  bucket_id = 'activation-media'
  and exists (
    select 1
    from public.activation_requests as req
    where req.id::text = (storage.foldername(name))[1]
      and req.user_id = auth.uid()
  )
);

-- INSERT / UPDATE: только пока заявка pending (после cancel загрузка закрыта).
drop policy if exists "Owner uploads own activation media" on storage.objects;
create policy "Owner uploads own activation media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'activation-media'
  and name ~ (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
  )
  and exists (
    select 1
    from public.activation_requests as req
    where req.id::text = (storage.foldername(name))[1]
      and req.user_id = auth.uid()
      and req.status = 'pending'
  )
);

drop policy if exists "Owner replaces own activation media" on storage.objects;
create policy "Owner replaces own activation media"
on storage.objects for update
to authenticated
using (
  bucket_id = 'activation-media'
  and exists (
    select 1
    from public.activation_requests as req
    where req.id::text = (storage.foldername(name))[1]
      and req.user_id = auth.uid()
      and req.status = 'pending'
  )
)
with check (
  bucket_id = 'activation-media'
  and name ~ (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
  )
  and exists (
    select 1
    from public.activation_requests as req
    where req.id::text = (storage.foldername(name))[1]
      and req.user_id = auth.uid()
      and req.status = 'pending'
  )
);

-- DELETE: pending (правка до отправки) или cancelled (очистка после отмены).
-- При failed файлы оставляет для разбора суперадмином.
drop policy if exists "Owner deletes own activation media" on storage.objects;
create policy "Owner deletes own activation media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'activation-media'
  and exists (
    select 1
    from public.activation_requests as req
    where req.id::text = (storage.foldername(name))[1]
      and req.user_id = auth.uid()
      and req.status in ('pending', 'cancelled')
  )
);

drop policy if exists "Superadmin reads activation media" on storage.objects;
create policy "Superadmin reads activation media"
on storage.objects for select
to authenticated
using (
  bucket_id = 'activation-media'
  and public.is_superadmin()
);

drop policy if exists "Superadmin uploads activation media" on storage.objects;
create policy "Superadmin uploads activation media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'activation-media'
  and public.is_superadmin()
);

drop policy if exists "Superadmin replaces activation media" on storage.objects;
create policy "Superadmin replaces activation media"
on storage.objects for update
to authenticated
using (
  bucket_id = 'activation-media'
  and public.is_superadmin()
)
with check (
  bucket_id = 'activation-media'
  and public.is_superadmin()
);

drop policy if exists "Superadmin deletes activation media" on storage.objects;
create policy "Superadmin deletes activation media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'activation-media'
  and public.is_superadmin()
);

-- anon не читает activation-media (bucket private, политик для anon нет).
