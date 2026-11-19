-- NFCMENU: тип бизнеса.
-- Запускать один раз в SQL Editor после supabase/archive.sql.
-- Этот файл не изменяет schema.sql, superadmin.sql, archive.sql и theme.sql.
-- Существующие строки получают kind = 'food'. Политики, триггеры и права не меняются.

alter table public.businesses
  add column kind text not null default 'food'
    constraint businesses_kind_check check (
      kind in ('food', 'beauty', 'repair', 'catalog')
    );
