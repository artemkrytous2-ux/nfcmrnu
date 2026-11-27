-- NFCMENU safe-migrations / order_enabled + call_button_enabled
-- Аддитивно. Существующие строки: order_enabled=true, call_button_enabled=false.
-- Политики не меняются.

do $$
begin
  if to_regclass('public.businesses') is null then
    raise exception 'NFCMENU 21: нет public.businesses — стоп';
  end if;
end $$;

alter table public.businesses
  add column if not exists order_enabled boolean not null default true;

alter table public.businesses
  add column if not exists call_button_enabled boolean not null default false;

-- ПРОВЕРКА
select
  '21-order-call' as migration,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'order_enabled'
  ) as order_enabled_ok,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'call_button_enabled'
  ) as call_button_enabled_ok;
