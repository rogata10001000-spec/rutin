-- LINEから受信した画像などのメディアを管理画面で表示できるようにする。
-- messages にメディア種別と保存先URLを追加し、保存用の公開バケットを作成する。

alter table public.messages
  add column if not exists message_type text not null default 'text',
  add column if not exists media_url text;

comment on column public.messages.message_type is 'メッセージ種別: text / image / sticker / video / audio / file / location';
comment on column public.messages.media_url is '画像など、保存したメディアの公開URL（chat-media バケット）';

-- chat-media バケット（公開・画像のみ。10MBまで）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- SELECT: 公開読み取り（管理画面で表示する）。
-- アップロードは Webhook の service_role 経由のため INSERT ポリシーは不要。
drop policy if exists "chat_media_storage_select" on storage.objects;
create policy "chat_media_storage_select"
on storage.objects for select
using (bucket_id = 'chat-media');
