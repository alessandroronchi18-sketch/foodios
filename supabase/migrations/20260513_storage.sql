-- ─────────────────────────────────────────────────────────────
-- Storage bucket per foto ricette
-- Esegui nel Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────

-- 1. Crea bucket pubblico per le foto
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ricette-foto',
  'ricette-foto',
  true,
  5242880, -- 5 MB max per foto
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do nothing;

-- 2. Policy: upload — solo l'org proprietaria può caricare
create policy "ricette_foto_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'ricette-foto'
    and auth.uid() in (
      select p.id from public.profiles p
      where p.organization_id::text = (storage.foldername(name))[1]
    )
  );

-- 3. Policy: update/delete — solo l'org proprietaria
create policy "ricette_foto_update"
  on storage.objects for update
  using (
    bucket_id = 'ricette-foto'
    and auth.uid() in (
      select p.id from public.profiles p
      where p.organization_id::text = (storage.foldername(name))[1]
    )
  );

create policy "ricette_foto_delete"
  on storage.objects for delete
  using (
    bucket_id = 'ricette-foto'
    and auth.uid() in (
      select p.id from public.profiles p
      where p.organization_id::text = (storage.foldername(name))[1]
    )
  );

-- 4. Policy: lettura pubblica (le foto nelle ricette sono pubbliche per i QR code)
create policy "ricette_foto_read"
  on storage.objects for select
  using (bucket_id = 'ricette-foto');
