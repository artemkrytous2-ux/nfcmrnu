-- NFCMENU safe-migrations / ЭТАП 1: PREFLIGHT
-- ТОЛЬКО чтение. Никаких CREATE / ALTER / DROP / INSERT / UPDATE / DELETE.
-- Не проверено на вашей живой базе автоматически — результат зависит от того, где вы запустите скрипт.
-- Запускайте первым в Supabase SQL Editor и сохраните вывод.

with
expected_business_cols as (
  select * from (
    values
      ('id'), ('owner_id'), ('slug'), ('name'), ('description'), ('address'),
      ('phone'), ('hours'), ('order_phone'), ('banner_path'),
      ('telegram_enabled'), ('max_enabled'), ('is_published'),
      ('created_at'), ('updated_at'),
      ('status'), ('is_blocked'), ('is_archived'),
      ('theme'), ('kind'),
      ('order_enabled'), ('call_button_enabled'),
      ('sub_description'),
      ('pwa_name'), ('pwa_icon_path'), ('pwa_prompt_enabled')
  ) as t(column_name)
),
table_checks as (
  select
    'T-' || t.table_name as check_id,
    case
      when to_regclass('public.' || t.table_name) is null then 'MISSING'
      else 'OK'
    end as severity,
    'table'::text as object_type,
    t.table_name as object_name,
    case
      when to_regclass('public.' || t.table_name) is null
        then 'Таблица public.' || t.table_name || ' отсутствует'
      else 'Таблица есть'
    end as detail
  from (
    values
      ('businesses'),
      ('categories'),
      ('products'),
      ('orders'),
      ('order_items'),
      ('superadmins'),
      ('portfolio_photos'),
      ('activation_requests'),
      ('business_subscriptions')
  ) as t(table_name)
),
business_col_checks as (
  select
    'C-businesses.' || e.column_name as check_id,
    case
      when to_regclass('public.businesses') is null then 'SKIP'
      when c.column_name is null then 'MISSING'
      else 'OK'
    end as severity,
    'column'::text as object_type,
    'businesses.' || e.column_name as object_name,
    case
      when to_regclass('public.businesses') is null
        then 'Сначала нужна таблица businesses — наличие одной колонки не доказывает таблицу'
      when c.column_name is null
        then 'Колонка отсутствует (для кода NFCMENU)'
      else
        'Тип: ' || c.data_type
        || ', nullable=' || c.is_nullable
        || coalesce(', default=' || c.column_default, '')
    end as detail
  from expected_business_cols e
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = 'businesses'
   and c.column_name = e.column_name
),
activation_col_checks as (
  select
    'C-activation_requests.' || e.column_name as check_id,
    case
      when to_regclass('public.activation_requests') is null then 'SKIP'
      when c.column_name is null then 'MISSING'
      else 'OK'
    end as severity,
    'column'::text as object_type,
    'activation_requests.' || e.column_name as object_name,
    case
      when to_regclass('public.activation_requests') is null
        then 'Таблица activation_requests отсутствует — колонки не проверялись'
      when c.column_name is null
        then 'Колонка отсутствует (нужна для актуального кода /try и /superadmin)'
      else 'Тип: ' || c.data_type
    end as detail
  from (
    values
      ('id'), ('user_id'), ('demo_payload'), ('plan_code'),
      ('plan_amount_rub'), ('plan_duration_months'), ('desired_slug'),
      ('contact_phone'), ('status'), ('business_id'),
      ('error_message'), ('activated_at'), ('created_at'), ('updated_at')
  ) as e(column_name)
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = 'activation_requests'
   and c.column_name = e.column_name
),
subscription_col_checks as (
  select
    'C-business_subscriptions.' || e.column_name as check_id,
    case
      when to_regclass('public.business_subscriptions') is null then 'SKIP'
      when c.column_name is null then 'MISSING'
      else 'OK'
    end as severity,
    'column'::text as object_type,
    'business_subscriptions.' || e.column_name as object_name,
    case
      when to_regclass('public.business_subscriptions') is null
        then 'Таблица business_subscriptions отсутствует'
      when c.column_name is null
        then 'Колонка отсутствует'
      else 'Тип: ' || c.data_type
    end as detail
  from (
    values
      ('id'), ('business_id'), ('plan_code'), ('plan_amount_rub'),
      ('plan_duration_months'), ('starts_at'), ('ends_at'), ('status'),
      ('source'), ('activation_request_id'), ('created_at'), ('updated_at')
  ) as e(column_name)
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = 'business_subscriptions'
   and c.column_name = e.column_name
),
function_checks as (
  select
    'F-' || f.proname as check_id,
    case when p.oid is null then 'MISSING' else 'OK' end as severity,
    'function'::text as object_type,
    f.proname as object_name,
    case
      when p.oid is null then 'Функция public.' || f.proname || ' не найдена'
      else 'Найдена, nargs=' || p.pronargs::text
    end as detail
  from (
    values
      ('set_updated_at'),
      ('is_superadmin'),
      ('current_business_id'),
      ('lock_business_identity'),
      ('lock_business_kind'),
      ('delete_archived_business'),
      ('place_order'),
      ('lock_activation_request_fields'),
      ('lock_business_subscription_fields'),
      ('enforce_product_business')
  ) as f(proname)
  left join lateral (
    select pp.oid, pp.pronargs
    from pg_proc pp
    join pg_namespace n on n.oid = pp.pronamespace
    where n.nspname = 'public' and pp.proname = f.proname
    order by pp.oid
    limit 1
  ) p on true
),
trigger_checks as (
  select
    'TR-' || x.trigger_name as check_id,
    case
      when to_regclass('public.' || x.table_name) is null then 'SKIP'
      when t.trigger_name is null then 'MISSING'
      else 'OK'
    end as severity,
    'trigger'::text as object_type,
    x.table_name || '.' || x.trigger_name as object_name,
    case
      when to_regclass('public.' || x.table_name) is null
        then 'Таблица отсутствует — триггер не проверялся'
      when t.trigger_name is null
        then 'Триггер отсутствует'
      else 'Есть'
    end as detail
  from (
    values
      ('businesses', 'businesses_lock_identity'),
      ('businesses', 'businesses_updated_at'),
      ('businesses', 'businesses_lock_kind'),
      ('categories', 'categories_updated_at'),
      ('products', 'products_updated_at'),
      ('products', 'products_same_business'),
      ('activation_requests', 'activation_requests_set_updated_at'),
      ('activation_requests', 'activation_requests_lock_fields'),
      ('business_subscriptions', 'business_subscriptions_set_updated_at'),
      ('business_subscriptions', 'business_subscriptions_lock_fields')
  ) as x(table_name, trigger_name)
  left join information_schema.triggers t
    on t.event_object_schema = 'public'
   and t.event_object_table = x.table_name
   and t.trigger_name = x.trigger_name
),
rls_checks as (
  select
    'RLS-' || x.table_name as check_id,
    case
      when c.relname is null then 'SKIP'
      when c.relrowsecurity then 'OK'
      else 'WARN'
    end as severity,
    'rls'::text as object_type,
    x.table_name as object_name,
    case
      when c.relname is null then 'Таблица отсутствует'
      when c.relrowsecurity then 'RLS включён'
      else 'RLS выключен — для NFCMENU обычно должен быть включён'
    end as detail
  from (
    values
      ('businesses'), ('categories'), ('products'), ('orders'), ('order_items'),
      ('superadmins'), ('portfolio_photos'),
      ('activation_requests'), ('business_subscriptions')
  ) as x(table_name)
  left join pg_class c
    on c.relname = x.table_name
   and c.relnamespace = 'public'::regnamespace
),
policy_name_checks as (
  select
    'P-' || x.tablename || ':' || left(md5(x.policyname), 8) as check_id,
    case
      when to_regclass('public.' || x.tablename) is null then 'SKIP'
      when p.policyname is null then 'MISSING'
      else 'OK'
    end as severity,
    'policy'::text as object_type,
    x.tablename || ' / ' || x.policyname as object_name,
    case
      when to_regclass('public.' || x.tablename) is null then 'Таблица отсутствует'
      when p.policyname is null then 'Политика с ожидаемым именем не найдена'
      else 'cmd=' || coalesce(p.cmd, '?')
    end as detail
  from (
    values
      ('activation_requests', 'Owner reads own activation requests'),
      ('activation_requests', 'Owner inserts own activation requests'),
      ('activation_requests', 'Owner updates own pending activation requests'),
      ('activation_requests', 'Superadmin reads activation requests'),
      ('business_subscriptions', 'Owner reads own business subscriptions'),
      ('business_subscriptions', 'Superadmin inserts business subscriptions'),
      ('portfolio_photos', 'Owner reads own portfolio photos'),
      ('portfolio_photos', 'Guests read portfolio of open businesses')
  ) as x(tablename, policyname)
  left join pg_policies p
    on p.schemaname = 'public'
   and p.tablename = x.tablename
   and p.policyname = x.policyname
),
bucket_checks as (
  select
    'B-' || b.id as check_id,
    case
      when sb.id is null then 'MISSING'
      when b.id = 'menu-photos' and sb.public is distinct from true then 'WARN'
      when b.id = 'activation-media' and sb.public is distinct from false then 'WARN'
      else 'OK'
    end as severity,
    'bucket'::text as object_type,
    b.id as object_name,
    case
      when sb.id is null then 'Bucket отсутствует'
      else
        'public=' || sb.public::text
        || coalesce(', size_limit=' || sb.file_size_limit::text, '')
    end as detail
  from (
    values ('menu-photos'), ('activation-media')
  ) as b(id)
  left join storage.buckets sb on sb.id = b.id
),
storage_policy_listing as (
  select
    'SP-list' as check_id,
    case when count(*) = 0 then 'WARN' else 'OK' end as severity,
    'storage_policy'::text as object_type,
    'storage.objects (все имена)' as object_name,
    coalesce(
      string_agg(policyname || '(' || cmd || ')', ', ' order by policyname),
      'Политик на storage.objects нет'
    ) as detail
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
),
storage_path_coverage as (
  select
    'SP-paths-' || folder as check_id,
    case
      when not exists (select 1 from storage.buckets where id = 'menu-photos')
        then 'SKIP'
      when coverage.hit then 'OK'
      else 'MISSING'
    end as severity,
    'storage_path'::text as object_type,
    'menu-photos path: ' || folder as object_name,
    case
      when not exists (select 1 from storage.buckets where id = 'menu-photos')
        then 'Bucket menu-photos отсутствует'
      when coverage.hit
        then 'Папка упомянута хотя бы в одной политике storage.objects'
      else
        'Папка НЕ найдена в определениях политик — риск отказа загрузки/чтения. '
        || 'Смотрите миграцию 40-storage-menu-photos-widen.sql'
    end as detail
  from (
    values ('banner'), ('products'), ('pwa-icon'), ('portfolio')
  ) as f(folder)
  cross join lateral (
    select exists (
      select 1
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'storage'
        and c.relname = 'objects'
        and (
          pg_get_expr(pol.polqual, pol.polrelid) ilike '%' || folder || '%'
          or pg_get_expr(pol.polwithcheck, pol.polrelid) ilike '%' || folder || '%'
        )
    ) as hit
  ) coverage
),
incompat_checks as (
  select
    'X-status-values' as check_id,
    case
      when to_regclass('public.businesses') is null then 'SKIP'
      when not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'businesses' and column_name = 'status'
      ) then 'SKIP'
      when exists (
        select 1
        from public.businesses
        where status is not null
          and status not in ('draft', 'demo', 'active')
      ) then 'INCOMPAT'
      else 'OK'
    end as severity,
    'data'::text as object_type,
    'businesses.status values' as object_name,
    case
      when to_regclass('public.businesses') is null then 'Нет таблицы'
      when not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'businesses' and column_name = 'status'
      ) then 'Колонки status нет'
      when exists (
        select 1
        from public.businesses
        where status is not null
          and status not in ('draft', 'demo', 'active')
      ) then 'Есть status вне draft/demo/active — миграции NFCMENU несовместимы без ручного разбора'
      else 'Значения status в допустимом наборе (или строк нет)'
    end as detail
),
known_facts as (
  select * from (
    values
      (
        'NOTE-known',
        'INFO'::text,
        'note'::text,
        'user-confirmed'::text,
        'Ранее подтверждено вручную: businesses.sub_description мог уже быть добавлен; bucket menu-photos public мог уже существовать. Preflight всё равно проверяет факты в этой БД.'::text
      ),
      (
        'NOTE-not-verified-live',
        'INFO',
        'note',
        'agent',
        'Этот отчёт не является доказательством синхронизации. Агент Cursor не подключался к вашей Supabase при подготовке файлов.'
      )
  ) as t(check_id, severity, object_type, object_name, detail)
),
summary as (
  select
    'Z-SUMMARY' as check_id,
    case
      when count(*) filter (where severity = 'INCOMPAT') > 0 then 'INCOMPAT'
      when count(*) filter (where severity = 'MISSING') > 0 then 'MISSING'
      when count(*) filter (where severity = 'WARN') > 0 then 'WARN'
      else 'OK'
    end as severity,
    'summary'::text as object_type,
    'totals' as object_name,
    format(
      'OK=%s MISSING=%s WARN=%s INCOMPAT=%s SKIP=%s INFO=%s',
      count(*) filter (where severity = 'OK'),
      count(*) filter (where severity = 'MISSING'),
      count(*) filter (where severity = 'WARN'),
      count(*) filter (where severity = 'INCOMPAT'),
      count(*) filter (where severity = 'SKIP'),
      count(*) filter (where severity = 'INFO')
    ) as detail
  from (
    select severity from table_checks
    union all select severity from business_col_checks
    union all select severity from activation_col_checks
    union all select severity from subscription_col_checks
    union all select severity from function_checks
    union all select severity from trigger_checks
    union all select severity from rls_checks
    union all select severity from policy_name_checks
    union all select severity from bucket_checks
    union all select severity from storage_policy_listing
    union all select severity from storage_path_coverage
    union all select severity from incompat_checks
  ) s
)
select check_id, severity, object_type, object_name, detail
from (
  select * from table_checks
  union all select * from business_col_checks
  union all select * from activation_col_checks
  union all select * from subscription_col_checks
  union all select * from function_checks
  union all select * from trigger_checks
  union all select * from rls_checks
  union all select * from policy_name_checks
  union all select * from bucket_checks
  union all select * from storage_policy_listing
  union all select * from storage_path_coverage
  union all select * from incompat_checks
  union all select * from known_facts
  union all select * from summary
) report
order by
  case severity
    when 'INCOMPAT' then 0
    when 'MISSING' then 1
    when 'WARN' then 2
    when 'OK' then 3
    when 'SKIP' then 4
    else 5
  end,
  check_id;
