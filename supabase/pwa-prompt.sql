-- NFCMENU: показ предложения установить приложение заведения.
-- Запускать вручную в SQL Editor один раз, после supabase/pwa-settings.sql.
-- Этот файл не изменяет schema.sql, pwa-settings.sql и остальные SQL-файлы.
-- Не меняет политики, триггеры и service_role.
-- Существующие строки получают pwa_prompt_enabled = true.
-- Пока файл не применён, публичное меню работает без предложения установки.

alter table public.businesses
  add column if not exists pwa_prompt_enabled boolean not null default true;
