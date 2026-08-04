-- よくある質問（/help）を管理画面から編集できるようにする。
--
-- 設計:
--   - 公開ページは service_role 経由で active=true のみ sort_order 順に表示
--   - 編集は admin のみ（Server Action の requireAdmin + RLS の二重防御）
--   - 「非表示で作成 → 内容を確認 → 表示」が下書きの代わり（2段階公開は文言システムほど
--     厳密さが要らないため、シンプルな可視フラグ方式にする）
--
-- 初期データは「現状のシステムの実挙動」に合わせた内容で投入する
-- （旧ページには self-serve 解約の実装前に書かれた「解約はLINEで連絡」等の古い案内が残っていた）。

create table if not exists public.faq_items (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_by uuid null references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.faq_items is
  'よくある質問。公開ページ(/help)は active=true を sort_order 順に表示。管理は /admin/faq。';

create index if not exists idx_faq_items_order on public.faq_items (active, sort_order);

alter table public.faq_items enable row level security;

-- SELECT: admin のみ（公開ページは service_role で読むためポリシー不要）
drop policy if exists "faq_items_select" on public.faq_items;
create policy "faq_items_select" on public.faq_items
  for select to authenticated
  using (public.is_admin());

-- INSERT/UPDATE/DELETE: ポリシーなし = authenticated からは不可（service_role のみ）

-- 初期データ（固定UUIDで冪等。既に存在すれば何もしない）
insert into public.faq_items (id, question, answer, sort_order, active) values
  (
    'f4900001-0000-4000-8000-000000000001',
    '担当メイトを変更できますか？',
    'はい、変更できます。LINEのトークで「担当を変更したい」とお送りください。運営チームが確認のうえ、新しい担当メイトをご案内します。',
    10, true
  ),
  (
    'f4900001-0000-4000-8000-000000000002',
    '解約したいときは？',
    'マイページの「契約・プラン」から、いつでもご自身でお手続きいただけます。解約後も次回更新日まではこれまでどおりご利用いただけ、更新日までは解約の取り消しも可能です。LINEでのご相談もお受けしています。',
    20, true
  ),
  (
    'f4900001-0000-4000-8000-000000000003',
    '無料トライアル中に解約したら料金はかかりますか？',
    'かかりません。トライアル期間中に解約のお手続きをされた場合、料金は発生しません。',
    30, true
  ),
  (
    'f4900001-0000-4000-8000-000000000004',
    '一時的にお休みできますか？',
    'はい。解約のお手続きの途中で「一時停止」をお選びいただけます。一時停止中は請求が止まり、準備ができたら同じ担当メイトでいつでも再開できます。',
    40, true
  ),
  (
    'f4900001-0000-4000-8000-000000000005',
    'お支払い方法（カード）を変更できますか？',
    'マイページの「お支払い方法」から、カードの変更や請求履歴の確認ができます。',
    50, true
  ),
  (
    'f4900001-0000-4000-8000-000000000006',
    '複数のメイトと話せますか？',
    '担当メイトはお一人です。別のメイトへの変更をご希望の場合は、LINEでお気軽にご相談ください。',
    60, true
  )
on conflict (id) do nothing;
