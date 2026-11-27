-- NFCMENU safe-migrations / жёсткая проверка ядра
-- Ничего не создаёт. Останавливается с понятной ошибкой, если рабочее ядро неполное.
-- Наличие одной колонки (например sub_description) НЕ считается доказательством всей таблицы.

do $$
declare
  missing text[] := array[]::text[];
  col text;
begin
  if to_regclass('public.businesses') is null then
    missing := missing || array['table public.businesses'];
  end if;
  if to_regclass('public.categories') is null then
    missing := missing || array['table public.categories'];
  end if;
  if to_regclass('public.products') is null then
    missing := missing || array['table public.products'];
  end if;
  if to_regclass('public.orders') is null then
    missing := missing || array['table public.orders'];
  end if;
  if to_regclass('public.order_items') is null then
    missing := missing || array['table public.order_items'];
  end if;

  if to_regclass('public.businesses') is not null then
    foreach col in array array[
      'id', 'owner_id', 'slug', 'name', 'description', 'is_published',
      'banner_path', 'created_at', 'updated_at'
    ]
    loop
      if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'businesses'
          and column_name = col
      ) then
        missing := missing || array['column businesses.' || col];
      end if;
    end loop;
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    missing := missing || array['function public.set_updated_at()'];
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'current_business_id'
  ) then
    missing := missing || array['function public.current_business_id()'];
  end if;

  if not exists (
    select 1 from storage.buckets where id = 'menu-photos'
  ) then
    missing := missing || array['bucket storage.menu-photos'];
  end if;

  if cardinality(missing) > 0 then
    raise exception
      'NFCMENU require-core: ядро БД неполное (%). Не запускайте additive-миграции. Разберите вручную (не применяйте schema.sql вслепую на рабочей базе).',
      array_to_string(missing, ', ');
  end if;

  raise notice 'NFCMENU require-core: OK — базовые таблицы, ключевые колонки businesses, set_updated_at, current_business_id, bucket menu-photos на месте.';
end $$;

-- ПРОВЕРКА
select
  'require-core' as check_name,
  to_regclass('public.businesses') is not null as has_businesses,
  to_regclass('public.categories') is not null as has_categories,
  to_regclass('public.products') is not null as has_products,
  exists (select 1 from storage.buckets where id = 'menu-photos') as has_menu_photos;
