-- NFCMENU safe-migrations / pwa_prompt_enabled
-- Аддитивно. Существующие строки: true. Политики не меняются.

do $$
begin
  if to_regclass('public.businesses') is null then
    raise exception 'NFCMENU 27: нет public.businesses — стоп';
  end if;
end $$;

alter table public.businesses
  add column if not exists pwa_prompt_enabled boolean not null default true;

-- ПРОВЕРКА
select
  '27-pwa-prompt' as migration,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'pwa_prompt_enabled'
  ) as column_ok;
