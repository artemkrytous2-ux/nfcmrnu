-- NFCMENU: приём заказов и кнопка «Позвонить» на публичной странице.
-- Запускать вручную в SQL Editor один раз.
-- Не изменяет schema.sql и остальные SQL-файлы.
-- Не меняет политики, триггеры и service_role.
-- Существующие строки: order_enabled = true, call_button_enabled = false.
-- Повторный запуск безопасен: ADD COLUMN IF NOT EXISTS.
-- На момент реализации колонки уже применены в живой базе.

alter table public.businesses
  add column if not exists order_enabled boolean not null default true;

alter table public.businesses
  add column if not exists call_button_enabled boolean not null default false;
