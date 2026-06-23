-- chat-media バケットを非公開化し、公開SELECTポリシーを撤去する。
-- 受信画像（1:1会話のPII）が認証不要の永続公開URLで露出するのを防ぐ。
-- 配信は /api/chat-media が「スタッフ認証＋担当チェック」後に短命の署名付きURLで行う。
-- アップロード・署名は service_role（createAdminSupabaseClient）が行うためRLSは不要。
update storage.buckets set public = false where id = 'chat-media';

drop policy if exists "chat_media_storage_select" on storage.objects;
