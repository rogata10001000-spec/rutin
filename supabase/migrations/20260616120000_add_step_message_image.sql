-- ステップ配信メッセージに画像を添付できるようにする
alter table public.step_messages
  add column if not exists image_url text null;

-- ステップ配信画像用の公開ストレージバケット
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'step-images',
  'step-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;
