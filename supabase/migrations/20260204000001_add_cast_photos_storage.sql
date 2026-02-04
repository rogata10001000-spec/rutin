-- Cast Photos Storage Migration
-- Supabase Storageのバケットとポリシー設定

-- =====================================================
-- 1. cast-photos バケット作成
-- =====================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cast-photos',
  'cast-photos',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- =====================================================
-- 2. Storage RLSポリシー
-- =====================================================

-- SELECT: 誰でも読み取り可能（公開バケット）
create policy "cast_photos_storage_select"
on storage.objects for select
using (bucket_id = 'cast-photos');

-- INSERT: Admin/Supervisor または 自分のフォルダのみ
create policy "cast_photos_storage_insert"
on storage.objects for insert
with check (
  bucket_id = 'cast-photos' and
  (
    -- Admin/Supervisor は全キャストの写真をアップロード可能
    exists (
      select 1 from public.staff_profiles
      where id = auth.uid() and role in ('admin', 'supervisor')
    )
    or
    -- キャスト自身は自分のフォルダのみ
    (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- UPDATE: Admin/Supervisor または 自分のフォルダのみ
create policy "cast_photos_storage_update"
on storage.objects for update
using (
  bucket_id = 'cast-photos' and
  (
    exists (
      select 1 from public.staff_profiles
      where id = auth.uid() and role in ('admin', 'supervisor')
    )
    or
    (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- DELETE: Admin/Supervisor または 自分のフォルダのみ
create policy "cast_photos_storage_delete"
on storage.objects for delete
using (
  bucket_id = 'cast-photos' and
  (
    exists (
      select 1 from public.staff_profiles
      where id = auth.uid() and role in ('admin', 'supervisor')
    )
    or
    (storage.foldername(name))[1] = auth.uid()::text
  )
);
