-- 受信トレイ一覧の高速化。
-- 従来は対象ユーザー全員の「全メッセージ（本文込み）」をワイヤー転送してJS集計していた。
-- 代わりにDB側で per-user の要約（最新メッセージ・最終受信/送信時刻・未読数）を集計し、
-- 約100行の要約だけ返すことで転送量とJS処理を大幅に削減する。
--
-- security invoker（既定）なので messages / staff_thread_reads の RLS は呼び出し元
-- （ログイン中スタッフ）の権限で評価される＝従来のRLSフィルタと同じ可視範囲を維持する。
create or replace function public.inbox_thread_summary(
  p_user_ids uuid[],
  p_staff_id uuid
)
returns table (
  end_user_id uuid,
  last_message_body text,
  last_message_direction text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  unread_count integer
)
language sql
stable
security invoker
as $$
  with reads as (
    select str.end_user_id, str.last_read_at
    from public.staff_thread_reads str
    where str.staff_id = p_staff_id
      and str.end_user_id = any(p_user_ids)
  ),
  agg as (
    select
      m.end_user_id,
      max(m.created_at) filter (where m.direction = 'in') as last_inbound_at,
      max(m.created_at) filter (where m.direction = 'out') as last_outbound_at,
      count(*) filter (
        where m.direction = 'in'
          and (r.last_read_at is null or m.created_at > r.last_read_at)
      )::int as unread_count
    from public.messages m
    left join reads r on r.end_user_id = m.end_user_id
    where m.end_user_id = any(p_user_ids)
    group by m.end_user_id
  ),
  latest as (
    select distinct on (m.end_user_id)
      m.end_user_id, m.body, m.direction, m.created_at
    from public.messages m
    where m.end_user_id = any(p_user_ids)
    order by m.end_user_id, m.created_at desc
  )
  select
    a.end_user_id,
    l.body as last_message_body,
    l.direction as last_message_direction,
    l.created_at as last_message_at,
    a.last_inbound_at,
    a.last_outbound_at,
    a.unread_count
  from agg a
  left join latest l on l.end_user_id = a.end_user_id;
$$;

grant execute on function public.inbox_thread_summary(uuid[], uuid) to authenticated;
