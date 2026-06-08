-- =====================================================
-- merge_end_users の実行権限を service_role のみに制限する
-- SECURITY DEFINER 関数は既定で PUBLIC に EXECUTE が付与されるため、
-- そのままだと一般 authenticated ユーザーが PostgREST 経由で呼び出し、
-- RLS をバイパスして end_user を統合・削除できてしまう（権限昇格）。
-- =====================================================
revoke all on function public.merge_end_users(uuid, uuid) from public;
revoke all on function public.merge_end_users(uuid, uuid) from anon;
revoke all on function public.merge_end_users(uuid, uuid) from authenticated;

grant execute on function public.merge_end_users(uuid, uuid) to service_role;
