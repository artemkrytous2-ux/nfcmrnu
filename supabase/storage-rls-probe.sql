-- Временная проверка Storage RLS.
-- Только две политики из supabase/archive.sql.
-- Не добавляет is_archived, не меняет функции и остальные политики.
-- Запускать отдельно. Полный archive.sql после проверки пересоздаёт эти же политики.

drop policy if exists "Superadmin reads venue menu files" on storage.objects;
create policy "Superadmin reads venue menu files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products)/[A-Za-z0-9._-]{1,180}$'
);

drop policy if exists "Superadmin deletes venue menu files" on storage.objects;
create policy "Superadmin deletes venue menu files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'menu-photos'
  and public.is_superadmin()
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(banner|products)/[A-Za-z0-9._-]{1,180}$'
);
