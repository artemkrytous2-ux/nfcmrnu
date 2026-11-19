-- NFCMENU: тема публичного меню заведения.
-- Запускать один раз в SQL Editor после supabase/archive.sql.
-- Этот файл не изменяет schema.sql, superadmin.sql и archive.sql.
-- Существующие строки получают theme = 'default'. Новых прав доступа нет.

alter table public.businesses
  add column theme text not null default 'default'
    constraint businesses_theme_check check (
      theme in ('default', 'minimal', 'warm', 'natural', 'soft', 'modern')
    );
