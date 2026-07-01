-- inbox_thread_summary を拡張し、受信トレイ一覧に必要な per-user 集計を1本のRPCに集約する。
-- 追加: today_sent_count（本日の送信数）, last_checkin_date（最新チェックイン日）,
--       has_open_risk / open_risk_level（未解決リスク）, had_previous_risk（過去リスク有無）。
-- これにより getInboxItems の checkins / risk_flags(2種) / 本日送信 の個別＆一部全件取得を撤廃し、
-- 受信トレイ/ダッシュボードのデータ取得を 5クエリ → 1RPC にできる。
-- 返却カラムと引数が変わるため CREATE OR REPLACE 不可。DROP → CREATE する。
-- security invoker のため messages/checkins/risk_flags/staff_thread_reads の RLS は
-- 呼び出しスタッフの権限で評価される（従来の可視範囲を維持）。
drop function if exists public.inbox_thread_summary(uuid[], uuid);

create function public.inbox_thread_summary(
  p_user_ids uuid[],
  p_staff_id uuid,
  p_today_start timestamptz
)
returns table (
  end_user_id uuid,
  last_message_body text,
  last_message_direction text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  unread_count integer,
  today_sent_count integer,
  last_checkin_date date,
  has_open_risk boolean,
  open_risk_level integer,
  had_previous_risk boolean
)
language sql
stable
security invoker
as $$
  with reads as (
    select str.end_user_id, str.last_read_at
    from public.staff_thread_reads str
    where str.staff_id = p_staff_id and str.end_user_id = any(p_user_ids)
  ),
  msg_agg as (
    select
      m.end_user_id,
      max(m.created_at) filter (where m.direction = 'in') as last_inbound_at,
      max(m.created_at) filter (where m.direction = 'out') as last_outbound_at,
      count(*) filter (
        where m.direction = 'in'
          and (r.last_read_at is null or m.created_at > r.last_read_at)
      )::int as unread_count,
      count(*) filter (
        where m.direction = 'out' and m.created_at >= p_today_start
      )::int as today_sent_count
    from public.messages m
    left join reads r on r.end_user_id = m.end_user_id
    where m.end_user_id = any(p_user_ids)
    group by m.end_user_id
  ),
  latest_msg as (
    select distinct on (m.end_user_id)
      m.end_user_id, m.body, m.direction, m.created_at
    from public.messages m
    where m.end_user_id = any(p_user_ids)
    order by m.end_user_id, m.created_at desc
  ),
  checkin_agg as (
    select c.end_user_id, max(c.date) as last_checkin_date
    from public.checkins c
    where c.end_user_id = any(p_user_ids)
    group by c.end_user_id
  ),
  open_risk as (
    -- 最新の「未解決(open)」リスク（従来のJSと同じく最新1件を採用）
    select distinct on (rf.end_user_id)
      rf.end_user_id, rf.risk_level as open_risk_level
    from public.risk_flags rf
    where rf.end_user_id = any(p_user_ids) and rf.status = 'open'
    order by rf.end_user_id, rf.created_at desc
  ),
  prev_risk as (
    -- 過去にリスクが立った(resolved/ack)ことがあるか
    select distinct rf.end_user_id
    from public.risk_flags rf
    where rf.end_user_id = any(p_user_ids) and rf.status in ('resolved', 'ack')
  ),
  base as (
    -- 全対象ユーザーを軸にする（メッセージ0件のユーザーも1行返す）
    select distinct unnest(p_user_ids) as end_user_id
  )
  select
    b.end_user_id,
    lm.body as last_message_body,
    lm.direction as last_message_direction,
    lm.created_at as last_message_at,
    ma.last_inbound_at,
    ma.last_outbound_at,
    coalesce(ma.unread_count, 0) as unread_count,
    coalesce(ma.today_sent_count, 0) as today_sent_count,
    ca.last_checkin_date,
    (ork.end_user_id is not null) as has_open_risk,
    ork.open_risk_level,
    (pr.end_user_id is not null) as had_previous_risk
  from base b
  left join msg_agg ma on ma.end_user_id = b.end_user_id
  left join latest_msg lm on lm.end_user_id = b.end_user_id
  left join checkin_agg ca on ca.end_user_id = b.end_user_id
  left join open_risk ork on ork.end_user_id = b.end_user_id
  left join prev_risk pr on pr.end_user_id = b.end_user_id;
$$;

grant execute on function public.inbox_thread_summary(uuid[], uuid, timestamptz) to authenticated;
