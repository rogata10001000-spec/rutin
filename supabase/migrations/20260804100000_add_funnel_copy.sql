-- 申込ファネル（メイト選択〜完了・LINE案内）の文言を管理画面から編集できるようにする。
--
-- 設計（docs/REQUIREMENTS_funnel-preview-editor.md）:
--   - key ごとに draft（下書き）と published（公開値）の2値を持つ2段階公開
--   - 行が無い/値が null のキーはコード内デフォルト（lib/funnel-copy-defs.ts）で表示
--     → データ移行なしでリリースでき、この機能の障害が申込ファネルを止めない
--   - エンドユーザー画面は service_role 経由で published のみを読む
--   - 編集は admin のみ（Server Action の requireAdmin + RLS の二重防御）

create table if not exists public.funnel_copy (
  key             text primary key,
  draft_value     text null,
  published_value text null,
  updated_by      uuid null references public.staff_profiles(id) on delete set null,
  updated_at      timestamptz not null default now()
);

comment on table public.funnel_copy is
  '申込ファネルの編集可能文言。キー定義とデフォルト値は lib/funnel-copy-defs.ts（コード側）が正。';
comment on column public.funnel_copy.draft_value is
  '下書き（プレビューのみで表示）。null = 下書きなし';
comment on column public.funnel_copy.published_value is
  '公開値。null = コード内デフォルトを表示';

alter table public.funnel_copy enable row level security;

-- SELECT: admin のみ（エディタ用。エンドユーザー画面は service_role で読むためポリシー不要）
drop policy if exists "funnel_copy_select" on public.funnel_copy;
create policy "funnel_copy_select" on public.funnel_copy
  for select to authenticated
  using (public.is_admin());

-- INSERT/UPDATE/DELETE: ポリシーなし = authenticated からは不可（service_role のみ）
