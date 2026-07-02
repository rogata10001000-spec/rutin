-- 権限監査による是正（RLS ハードニング）
-- 各修正はアプリの正規経路を壊さないことを確認済み。

-- =====================================================
-- 1) staff_profiles: 権限昇格の防止（重大）
-- 旧: UPDATE using (id = auth.uid() or is_admin()) で WITH CHECK 省略。
--     Postgres は WITH CHECK 省略時に USING を流用するため、cast/supervisor が
--     自分の行を UPDATE して role='admin' に書き換えられた（自己昇格）。
-- 本人の表示名/公開プロフィール編集は Server Action が service_role で列を限定して
-- 行う（cast-profile.ts / admin/staff.ts）。RLS クライアント経由の staff_profiles 更新は
-- requireAdmin 済みの管理者操作のみ。よって UPDATE を admin 限定にしても機能は壊れない。
-- =====================================================
drop policy if exists "staff_profiles_update" on public.staff_profiles;
create policy "staff_profiles_update" on public.staff_profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =====================================================
-- 2) audit_logs: 監査ログ偽造の防止
-- 旧: INSERT with check (true) で任意の認証ユーザーが偽の監査ログを挿入できた。
-- 監査ログの書き込みは全経路 service_role（writeAuditLog / cron ジョブ）であり、
-- service_role は RLS をバイパスするため、認証ユーザーの INSERT ポリシーを撤去する。
-- =====================================================
drop policy if exists "audit_logs_insert" on public.audit_logs;
-- INSERT ポリシーを作らない = 認証ユーザーは挿入不可（service_role は継続して挿入可能）

-- =====================================================
-- 3) ai_drafts: 無制限 INSERT の是正
-- 旧: INSERT with check (is_admin_or_supervisor() or true) → 実質常に true。
--     任意の認証ユーザーが任意の request に対して ai_drafts を挿入できた。
-- 正規経路(actions/ai.ts)は canAccessUser でアクセス権を確認済みのスタッフが、
-- 自分が作成した request_id に対して挿入する。SELECT と同じスコープに揃える。
-- =====================================================
drop policy if exists "ai_drafts_insert" on public.ai_drafts;
create policy "ai_drafts_insert" on public.ai_drafts
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ai_draft_requests r
      where r.id = request_id
        and (public.is_admin_or_supervisor() or public.is_assigned_to_user(r.end_user_id))
    )
  );
