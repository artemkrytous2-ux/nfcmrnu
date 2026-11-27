-- NFCMENU safe-migrations / ЭТАП 4c: private bucket activation-media + RLS
-- Не меняет политики menu-photos.
-- Пути: {request_id}/(banner|products|pwa-icon)/{файл} — как в src/lib/activation-media.ts
-- INSERT/UPDATE только при status=pending; DELETE при pending|cancelled.

do $$
begin
  if to_regclass('public.activation_requests') is null then
    raise exception 'NFCMENU 52: нет activation_requests — сначала 50-activation-requests.sql';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_superadmin'
  ) then
    raise exception 'NFCMENU 52: нет is_superadmin() — стоп';
  end if;

  if exists (
    select 1 from storage.buckets where id = 'activation-media' and public is true
  ) then
    raise exception
      'NFCMENU 52: bucket activation-media уже есть и PUBLIC=true — несовместимо с приватными медиа заявок. Исправьте вручную (сделайте private) и повторите.';
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'activation-media',
  'activation-media',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- В EXISTS используем objects.name (не голое name): иначе при появлении колонки
-- name у activation_requests PostgreSQL возьмёт внутренний req.name — тот же класс бага, что portfolio/venue.name.
drop policy if exists "Owner reads own activation media" on storage.objects;
create policy "Owner reads own activation media"
on storage.objects for select
to authenticated
using (
  bucket_id = 'activation-media'
  and exists (
    select 1
    from public.activation_requests as req
    where req.id::text = (storage.foldername(objects.name))[1]
      and req.user_id = auth.uid()
  )
);

drop policy if exists "Owner uploads own activation media" on storage.objects;
create policy "Owner uploads own activation media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'activation-media'
  and objects.name ~ (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
  )
  and exists (
    select 1
    from public.activation_requests as req
    where req.id::text = (storage.foldername(objects.name))[1]
      and req.user_id = auth.uid()
      and req.status = 'pending'
  )
);

drop policy if exists "Owner replaces own activation media" on storage.objects;
create policy "Owner replaces own activation media"
on storage.objects for update
to authenticated
using (
  bucket_id = 'activation-media'
  and exists (
    select 1
    from public.activation_requests as req
    where req.id::text = (storage.foldername(objects.name))[1]
      and req.user_id = auth.uid()
      and req.status = 'pending'
  )
)
with check (
  bucket_id = 'activation-media'
  and objects.name ~ (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$'
  )
  and exists (
    select 1
    from public.activation_requests as req
    where req.id::text = (storage.foldername(objects.name))[1]
      and req.user_id = auth.uid()
      and req.status = 'pending'
  )
);

drop policy if exists "Owner deletes own activation media" on storage.objects;
create policy "Owner deletes own activation media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'activation-media'
  and exists (
    select 1
    from public.activation_requests as req
    where req.id::text = (storage.foldername(objects.name))[1]
      and req.user_id = auth.uid()
      and req.status in ('pending', 'cancelled')
  )
);

drop policy if exists "Superadmin reads activation media" on storage.objects;
create policy "Superadmin reads activation media"
on storage.objects for select
to authenticated
using (
  bucket_id = 'activation-media'
  and public.is_superadmin()
);

drop policy if exists "Superadmin uploads activation media" on storage.objects;
create policy "Superadmin uploads activation media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'activation-media'
  and public.is_superadmin()
);

drop policy if exists "Superadmin replaces activation media" on storage.objects;
create policy "Superadmin replaces activation media"
on storage.objects for update
to authenticated
using (
  bucket_id = 'activation-media'
  and public.is_superadmin()
)
with check (
  bucket_id = 'activation-media'
  and public.is_superadmin()
);

drop policy if exists "Superadmin deletes activation media" on storage.objects;
create policy "Superadmin deletes activation media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'activation-media'
  and public.is_superadmin()
);

-- ПРОВЕРКА
select
  '52-activation-media' as migration,
  exists (
    select 1 from storage.buckets where id = 'activation-media' and public = false
  ) as bucket_private_ok,
  (
    select count(*) from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like '%activation media%'
  ) as activation_media_policy_count;
