-- NFCMENU safe-migrations / pwa_name + pwa_icon_path
-- Только колонки и CHECK. Storage-политики НЕ меняются (см. 40-...).
-- Существующие строки: null.

do $$
begin
  if to_regclass('public.businesses') is null then
    raise exception 'NFCMENU 26: нет public.businesses — стоп';
  end if;
end $$;

alter table public.businesses
  add column if not exists pwa_name text,
  add column if not exists pwa_icon_path text;

do $$
begin
  if exists (
    select 1 from public.businesses
    where pwa_name is not null
      and not (
        char_length(pwa_name) <= 40
        and char_length(btrim(pwa_name)) between 1 and 40
        and pwa_name = btrim(pwa_name)
      )
  ) then
    raise exception 'NFCMENU 26: есть некорректные pwa_name — исправьте до CHECK';
  end if;

  alter table public.businesses drop constraint if exists businesses_pwa_name_length;
  alter table public.businesses
    add constraint businesses_pwa_name_length check (
      pwa_name is null
      or (
        char_length(pwa_name) <= 40
        and char_length(btrim(pwa_name)) between 1 and 40
        and pwa_name = btrim(pwa_name)
      )
    );

  if exists (
    select 1 from public.businesses
    where pwa_icon_path is not null
      and not (
        char_length(pwa_icon_path) <= 240
        and pwa_icon_path ~ ('^' || id::text || '/pwa-icon/[A-Za-z0-9._-]{1,180}$')
      )
  ) then
    raise exception 'NFCMENU 26: есть некорректные pwa_icon_path — исправьте до CHECK';
  end if;

  alter table public.businesses drop constraint if exists businesses_pwa_icon_path_shape;
  alter table public.businesses
    add constraint businesses_pwa_icon_path_shape check (
      pwa_icon_path is null
      or (
        char_length(pwa_icon_path) <= 240
        and pwa_icon_path ~ (
          '^' || id::text || '/pwa-icon/[A-Za-z0-9._-]{1,180}$'
        )
      )
    );
end $$;

-- ПРОВЕРКА
select
  '26-pwa-columns' as migration,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'pwa_name'
  ) as pwa_name_ok,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'pwa_icon_path'
  ) as pwa_icon_path_ok;
