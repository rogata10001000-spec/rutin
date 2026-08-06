-- AI下書き機能の進化（Phase 1-4）に伴うスキーマ拡張。
--
-- 1) 事前生成（pregen）: ユーザーからの受信時に裏で下書きを作っておき、
--    メイトがスレッドを開いた瞬間に待ち時間ゼロで表示する。
--    鮮度判定のため「生成時点の最新メッセージID」を列で持つ。
-- 2) 計測: モデル・トークン使用量を記録し、コストと品質を実測できるようにする。
-- 3) 採用トラッキング: どの案が選ばれ、どう編集されて送信されたかを記録する
--    （メイト別の採用率・編集率の可視化と、将来の学習材料）。

alter table public.ai_draft_requests
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'bulk', 'pregen')),
  add column if not exists instruction text null,
  add column if not exists latest_message_id uuid null,
  add column if not exists model text null,
  add column if not exists input_tokens integer null,
  add column if not exists output_tokens integer null;

comment on column public.ai_draft_requests.source is
  'manual=チャットのボタン / bulk=一括生成 / pregen=受信時の事前生成（日次制限の対象外）';
comment on column public.ai_draft_requests.latest_message_id is
  '生成時点でのそのユーザーの最新メッセージID。事前生成の鮮度判定に使う';

-- 事前生成の鮮度チェック用（end_user の最新 pregen を素早く引く）
create index if not exists idx_ai_draft_requests_pregen
  on public.ai_draft_requests (end_user_id, created_at desc)
  where source = 'pregen';

alter table public.ai_drafts
  add column if not exists selected_at timestamptz null,
  add column if not exists sent_message_id uuid null references public.messages(id) on delete set null,
  add column if not exists sent_body text null;

comment on column public.ai_drafts.selected_at is '採用（この案が送信に使われた）日時';
comment on column public.ai_drafts.sent_body is
  '実際に送信された本文（body と比較して編集率を計測する）';

-- 採用率集計用
create index if not exists idx_ai_drafts_request on public.ai_drafts (request_id);

-- 更新は service_role（Server Action 内で権限確認後）のみ。
-- authenticated 向けの UPDATE ポリシーは引き続き作らない（改ざん防止）。
