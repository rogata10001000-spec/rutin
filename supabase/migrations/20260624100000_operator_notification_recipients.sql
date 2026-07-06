-- 運営向け通知（新規会員登録など）のLINE通知先。
-- 通知先は「Rutinの公式LINEに登録済みのユーザー(end_users)」から選ぶ。
-- 送信は cron/webhook が service_role で行うため、書き込みRLSは管理操作のみを想定。
create table if not exists public.operator_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  event_type text not null default 'new_member' check (event_type in ('new_member')),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  created_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_type, end_user_id)
);

comment on table public.operator_notification_recipients is
  '運営向けLINE通知の宛先（event_type別。宛先はend_users＝公式LINE登録ユーザー）';

alter table public.operator_notification_recipients enable row level security;

-- SELECT: 管理者/SV（設定確認）
drop policy if exists "operator_notify_recipients_select" on public.operator_notification_recipients;
create policy "operator_notify_recipients_select" on public.operator_notification_recipients
  for select to authenticated
  using (public.is_admin_or_supervisor());

-- INSERT/DELETE: admin のみ（ロールベース＝列値に依存しないため WITH CHECK は USING と同義で安全）
drop policy if exists "operator_notify_recipients_insert" on public.operator_notification_recipients;
create policy "operator_notify_recipients_insert" on public.operator_notification_recipients
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "operator_notify_recipients_delete" on public.operator_notification_recipients;
create policy "operator_notify_recipients_delete" on public.operator_notification_recipients
  for delete to authenticated
  using (public.is_admin());
