-- Cast Photos Migration
-- キャストの写真ギャラリー機能用テーブルとRLSポリシー

-- =====================================================
-- 1. cast_photos テーブル作成
-- =====================================================
create table if not exists public.cast_photos (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid not null references public.staff_profiles(id) on delete cascade,
  storage_path text not null,
  display_order int not null default 0,
  caption text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- インデックス
create index if not exists idx_cast_photos_cast on public.cast_photos(cast_id, display_order);
create index if not exists idx_cast_photos_active on public.cast_photos(cast_id, active);

-- コメント
comment on table public.cast_photos is 'キャストのプロフィール写真（最大5枚）';
comment on column public.cast_photos.storage_path is 'Supabase Storage内のパス（cast-photos/{cast_id}/{photo_id}.{ext}）';
comment on column public.cast_photos.display_order is '表示順序（0から始まる）';
comment on column public.cast_photos.caption is '写真のキャプション（最大200文字）';

-- =====================================================
-- 2. RLSを有効化
-- =====================================================
alter table public.cast_photos enable row level security;

-- =====================================================
-- 3. RLSポリシー
-- =====================================================

-- SELECT: 全員（公開情報）
create policy "cast_photos_select_public"
on public.cast_photos for select
using (active = true);

-- SELECT: 管理者は非アクティブも含めて全て見れる
create policy "cast_photos_select_admin"
on public.cast_photos for select
using (
  exists (
    select 1 from public.staff_profiles
    where id = auth.uid() and role in ('admin', 'supervisor')
  )
);

-- INSERT: Admin/Supervisor または 自分自身
create policy "cast_photos_insert"
on public.cast_photos for insert
with check (
  exists (
    select 1 from public.staff_profiles
    where id = auth.uid() and role in ('admin', 'supervisor')
  )
  or cast_id = auth.uid()
);

-- UPDATE: Admin/Supervisor または 自分自身
create policy "cast_photos_update"
on public.cast_photos for update
using (
  exists (
    select 1 from public.staff_profiles
    where id = auth.uid() and role in ('admin', 'supervisor')
  )
  or cast_id = auth.uid()
);

-- DELETE: Admin/Supervisor または 自分自身
create policy "cast_photos_delete"
on public.cast_photos for delete
using (
  exists (
    select 1 from public.staff_profiles
    where id = auth.uid() and role in ('admin', 'supervisor')
  )
  or cast_id = auth.uid()
);

-- =====================================================
-- 4. updated_at 自動更新トリガー
-- =====================================================
create or replace function public.handle_cast_photos_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_cast_photos_updated
  before update on public.cast_photos
  for each row execute procedure public.handle_cast_photos_updated_at();

-- =====================================================
-- 5. 5枚制限を確認する関数（アプリケーション層で使用）
-- =====================================================
create or replace function public.check_cast_photos_limit(p_cast_id uuid)
returns boolean as $$
declare
  photo_count int;
begin
  select count(*) into photo_count
  from public.cast_photos
  where cast_id = p_cast_id and active = true;
  
  return photo_count < 5;
end;
$$ language plpgsql security definer;

comment on function public.check_cast_photos_limit is 'キャストの写真が5枚未満かチェック';
