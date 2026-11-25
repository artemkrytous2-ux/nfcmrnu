-- NFCMENU: подописание заведения (sub_description) на публичной странице.
-- Запускать вручную в SQL Editor один раз.
-- Не изменяет schema.sql и остальные SQL-файлы.
-- Не меняет политики, триггеры и service_role.
-- Существующие строки: sub_description = ''.
-- Длина ограничена 150 символами (CHECK).
-- Повторный запуск безопасен: колонка IF NOT EXISTS, ограничение — через проверку.
-- Миграция уже выполнена в Supabase. Этот файл — только документация; повторно не запускать.

alter table public.businesses
  add column if not exists sub_description text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'businesses_sub_description_length_check'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_sub_description_length_check
      check (char_length(sub_description) <= 150);
  end if;
end $$;
