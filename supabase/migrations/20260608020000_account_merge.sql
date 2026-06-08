-- =====================================================
-- アカウント統合（LINE/メール）の土台
-- 1) 将来のメール単独サインアップに備え line_user_id を NULL 許容化
-- 2) 同一人物の重複 end_user を安全に統合する関数を追加
-- =====================================================

-- line_user_id を NULL 許容に（unique 制約は維持。Postgres では複数 NULL を許容）
alter table public.end_users
  alter column line_user_id drop not null;

-- =====================================================
-- merge_end_users: source を target に統合する（原子的）
--   - 子テーブルの end_user_id を付け替え
--   - 一意制約のある checkins / birthday_congrats は競合行を除外して付け替え
--   - target に未設定の連絡先（email/phone/birthday）は source から引き継ぐ
--   - 最後に source を削除
-- service_role / 管理操作からのみ呼び出す想定（SECURITY DEFINER）
-- =====================================================
create or replace function public.merge_end_users(p_source uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source is null or p_target is null then
    raise exception 'source/target must not be null';
  end if;
  if p_source = p_target then
    raise exception 'source and target must differ';
  end if;
  if not exists (select 1 from public.end_users where id = p_source) then
    raise exception 'source end_user not found';
  end if;
  if not exists (select 1 from public.end_users where id = p_target) then
    raise exception 'target end_user not found';
  end if;

  -- 競合しうる一意制約テーブル: 既に target 側にある (date/year) は source 行を破棄
  delete from public.checkins c
   where c.end_user_id = p_source
     and exists (
       select 1 from public.checkins t
        where t.end_user_id = p_target and t.date = c.date
     );
  update public.checkins set end_user_id = p_target where end_user_id = p_source;

  delete from public.birthday_congrats b
   where b.end_user_id = p_source
     and exists (
       select 1 from public.birthday_congrats t
        where t.end_user_id = p_target and t.year = b.year
     );
  update public.birthday_congrats set end_user_id = p_target where end_user_id = p_source;

  -- 一意制約のない子テーブルは単純付け替え
  update public.cast_assignments  set end_user_id = p_target where end_user_id = p_source;
  update public.subscriptions     set end_user_id = p_target where end_user_id = p_source;
  update public.messages          set end_user_id = p_target where end_user_id = p_source;
  update public.memos             set end_user_id = p_target where end_user_id = p_source;
  update public.ai_draft_requests set end_user_id = p_target where end_user_id = p_source;
  update public.shadow_drafts     set end_user_id = p_target where end_user_id = p_source;
  update public.risk_flags        set end_user_id = p_target where end_user_id = p_source;
  update public.user_point_ledger set end_user_id = p_target where end_user_id = p_source;
  update public.gift_sends        set end_user_id = p_target where end_user_id = p_source;
  update public.revenue_events    set end_user_id = p_target where end_user_id = p_source;
  update public.user_login_tokens set end_user_id = p_target where end_user_id = p_source;

  -- 連絡先・属性の引き継ぎ（target 未設定時のみ）
  update public.end_users t
     set email             = coalesce(t.email, s.email),
         email_verified_at = coalesce(t.email_verified_at, s.email_verified_at),
         phone             = coalesce(t.phone, s.phone),
         birthday          = coalesce(t.birthday, s.birthday),
         line_user_id      = coalesce(t.line_user_id, s.line_user_id)
    from public.end_users s
   where t.id = p_target
     and s.id = p_source;

  -- source のメール一意制約を解放してから削除（target が引き継いだ場合の衝突回避）
  update public.end_users
     set email = null, line_user_id = null
   where id = p_source;

  delete from public.end_users where id = p_source;
end;
$$;

comment on function public.merge_end_users(uuid, uuid) is
  '重複 end_user を統合する（子テーブル付け替え + source削除）。管理/service_role からのみ使用。';
