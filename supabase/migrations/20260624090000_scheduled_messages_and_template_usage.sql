-- 一斉送信の「予約送信」と、テンプレートの使用回数学習。

-- =====================================================
-- 1) scheduled_messages: 予約送信キュー
--    作成はスタッフ（RLSで担当スコープ）、実際の送信は cron が service_role で行う。
-- =====================================================
create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  created_by uuid not null references public.staff_profiles(id) on delete cascade,
  body text not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'canceled')),
  sent_message_id uuid references public.messages(id),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.scheduled_messages is '予約送信キュー（cronが期日到来分をLINE送信しmessagesへ記録する）';

create index if not exists idx_scheduled_messages_due
  on public.scheduled_messages (status, scheduled_at);
create index if not exists idx_scheduled_messages_creator
  on public.scheduled_messages (created_by, status, scheduled_at);

alter table public.scheduled_messages enable row level security;

-- SELECT: 自分が作成したもの＋Admin/Supervisorは全件
drop policy if exists "scheduled_messages_select" on public.scheduled_messages;
create policy "scheduled_messages_select" on public.scheduled_messages
  for select to authenticated
  using (created_by = auth.uid() or public.is_admin_or_supervisor());

-- INSERT: 本人名義のみ＋送信権限のある相手のみ（担当 or Admin/SV）
drop policy if exists "scheduled_messages_insert" on public.scheduled_messages;
create policy "scheduled_messages_insert" on public.scheduled_messages
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (public.is_admin_or_supervisor() or public.is_assigned_to_user(end_user_id))
  );

-- UPDATE（キャンセル等）: 自分が作成した行のみ。所有者(created_by)の付け替えは不可
drop policy if exists "scheduled_messages_update" on public.scheduled_messages;
create policy "scheduled_messages_update" on public.scheduled_messages
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

-- DELETE: なし（キャンセルは status='canceled' で記録を残す）

-- =====================================================
-- 2) message_templates: 使用回数（よく使うテンプレを上に出す）
-- =====================================================
alter table public.message_templates
  add column if not exists usage_count integer not null default 0;
