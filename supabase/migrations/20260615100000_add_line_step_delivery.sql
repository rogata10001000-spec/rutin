-- ステップ配信（LINE登録後に一定時間後へ自動送信するドリップメッセージ）
-- 目的: 未契約フォロワーの契約率向上。登録(line_followed_at)を起点に、
--       管理画面で定義した文面を順番に自動送信する。契約したら以降は送らない。

create table if not exists public.step_messages (
  id uuid primary key default gen_random_uuid(),
  step_order int not null,                 -- 配信順（小さいほど先）
  delay_hours int not null default 0,      -- 登録(line_followed_at)からの経過時間（時間単位）
  title text,                              -- 管理用のラベル（任意）
  body text not null,                      -- 実際に送信する本文
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_step_messages_order on public.step_messages (active, step_order, delay_hours);

create table if not exists public.step_deliveries (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  step_message_id uuid not null references public.step_messages(id) on delete cascade,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  created_at timestamptz not null default now(),
  unique (end_user_id, step_message_id)     -- 同一ステップの二重送信防止
);
create index if not exists idx_step_deliveries_user on public.step_deliveries (end_user_id);
create index if not exists idx_step_deliveries_step on public.step_deliveries (step_message_id);

-- RLS
alter table public.step_messages enable row level security;
alter table public.step_deliveries enable row level security;

drop policy if exists step_messages_admin_all on public.step_messages;
create policy step_messages_admin_all on public.step_messages
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists step_deliveries_staff_read on public.step_deliveries;
create policy step_deliveries_staff_read on public.step_deliveries
  for select using (public.is_admin_or_supervisor());
