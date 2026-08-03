-- 関数の実行権限の堅牢化（実測で確認した穴を塞ぐ）。
--
-- 背景（CLAUDE.md「DB権限は実測で確認する」の通り、anonキーで実際に叩いて確認した結果）:
--   関数は CREATE 時に PUBLIC へ EXECUTE が自動付与され、さらに Supabase の
--   default privileges が anon/authenticated へ直接 grant する。明示的に剥奪していない
--   関数は、公開されている anon キーだけで誰でも実行できる状態だった。
--
--   実測（2026-07-07・anonキー）:
--     ✅ 拒否済み: merge_end_users / send_gift_atomic / create_settlement_batch_atomic
--                  / audit_log_distinct_* （いずれも明示 revoke 済み）
--     ⚠️ 実行可能: get_cohort_revenue / check_cast_photos_limit / inbox_thread_summary
--                  / is_admin / is_admin_or_supervisor / get_current_staff_role
--                  / is_assigned_to_user / is_shadow_for_user
--
--   最も実害が大きいのは get_cohort_revenue。security definer なので RLS をバイパスし、
--   月次の売上集計を「匿名の誰でも」取得できた（現時点は売上データが無いため空配列が返るだけだが、
--   売上が発生した時点で漏えいに変わる時限爆弾）。
--
-- 方針:
--   1. security definer 関数は「自分で権限判定する」ことを必須とする（呼び出しロールを信用しない）
--   2. 各関数に必要最小限のロールだけ明示 grant する
--   3. 今後作る関数が同じ穴を持たないよう default privileges 自体を締める
--
-- 注: トリガー関数（handle_updated_at / handle_cast_photos_updated_at）は returns trigger のため
--     PostgREST から呼び出せず、EXECUTE を剥奪すると書き込みが壊れる可能性があるため対象外とする。

-- =====================================================
-- 1) get_cohort_revenue: security definer 側で権限を判定する
-- =====================================================
-- 呼び出しは actions/admin/cohort.ts（requireAdminOrSupervisor 済み・authenticated ロール）。
-- authenticated には EXECUTE が必要だが、それだけでは「一般スタッフ(cast)が
-- PostgREST で直接叩けば売上が読める」状態が残るため、関数自身でも判定する（多層防御）。
create or replace function public.get_cohort_revenue()
returns table (cohort_month text, total_incl_tax bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    to_char(date_trunc('month', coalesce(eu.trial_started_at, eu.subscribed_at)), 'YYYY-MM') as cohort_month,
    sum(re.amount_incl_tax_jpy)::bigint as total_incl_tax
  from public.end_users eu
  join public.revenue_events re on re.end_user_id = eu.id
  where coalesce(eu.trial_started_at, eu.subscribed_at) is not null
    -- security definer は RLS をバイパスするため、関数内で権限を判定する。
    -- service_role（Webhook/バッチ）は auth.uid() を持たないため明示的に許可する。
    and (public.is_admin_or_supervisor() or auth.role() = 'service_role')
  group by 1;
$$;

revoke execute on function public.get_cohort_revenue() from public, anon;
grant execute on function public.get_cohort_revenue() to authenticated, service_role;

-- =====================================================
-- 2) check_cast_photos_limit: service_role からのみ呼ぶ
-- =====================================================
-- 呼び出しは actions/cast-photos.ts の createAdminSupabaseClient（service_role）のみ。
revoke execute on function public.check_cast_photos_limit(uuid) from public, anon, authenticated;
grant execute on function public.check_cast_photos_limit(uuid) to service_role;

-- =====================================================
-- 3) inbox_thread_summary: ログイン済みスタッフのみ
-- =====================================================
-- security invoker のためデータ自体は RLS で守られるが、匿名から巨大な配列を渡して
-- 集計負荷をかけられる状態だった（DoS 面）。認証済みロールに限定する。
revoke execute on function public.inbox_thread_summary(uuid[], uuid, timestamptz) from public, anon;
grant execute on function public.inbox_thread_summary(uuid[], uuid, timestamptz) to authenticated, service_role;

-- =====================================================
-- 4) RLSヘルパー関数: 匿名からの直接実行を止める
-- =====================================================
-- ポリシー式の評価に必要なため authenticated は残す。
-- anon 向けのポリシー（例 cast_photos_select_public）はこれらの関数を使っていないため、
-- anon から剥奪しても公開ページの読み取りには影響しない。
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

revoke execute on function public.is_admin_or_supervisor() from public, anon;
grant execute on function public.is_admin_or_supervisor() to authenticated, service_role;

revoke execute on function public.get_current_staff_role() from public, anon;
grant execute on function public.get_current_staff_role() to authenticated, service_role;

revoke execute on function public.is_assigned_to_user(uuid) from public, anon;
grant execute on function public.is_assigned_to_user(uuid) to authenticated, service_role;

revoke execute on function public.is_shadow_for_user(uuid) from public, anon;
grant execute on function public.is_shadow_for_user(uuid) to authenticated, service_role;

-- =====================================================
-- 5) 恒久対策: 今後作る関数が自動で公開されないようにする
-- =====================================================
-- Supabase の default privileges は新規関数へ anon/authenticated に直接 grant する。
-- これを止め、「必要なロールに明示 grant する」を既定にする。
-- 付け忘れた場合は permission denied で明確に失敗する（＝黙って公開されるより安全な方向に倒す）。
do $$
begin
  execute format(
    'alter default privileges for role %I in schema public revoke execute on functions from anon, authenticated',
    current_user
  );
end
$$;
