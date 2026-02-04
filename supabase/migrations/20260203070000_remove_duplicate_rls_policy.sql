-- 重複RLSポリシーを削除
-- cast_cannot_view_incomplete_users は end_users_select と重複しているため不要

drop policy if exists "cast_cannot_view_incomplete_users" on public.end_users;

-- 注意: end_users_select ポリシー（00002_rls_policies.sql）が
-- 以下のロジックで包括的にカバーしている:
-- - Admin/Supervisor: 全件アクセス可能
-- - Cast: status != 'incomplete' かつ (担当 or Shadow期間中)
