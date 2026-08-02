-- 監査ログの絞り込み候補（action / target_type の DISTINCT）を、
-- 行数に比例しない形で取得できるようにする。
--
-- 背景: /admin/audit はドロップダウンの候補を作るためだけに audit_logs を SELECT していた。
-- audit_logs は運用に比例して無限に増えるテーブルなので、全件スキャンは時間とともに
-- 確実に遅くなる（暫定対応として直近1000行に制限していたが、古い種別が候補から消える副作用があった）。
--
-- 対応: インデックスを「次に大きい値」へ飛び石で辿る loose index scan で DISTINCT を取る。
-- 走査コストは行数ではなく「実際に存在する種別数」に概ね比例し、候補も欠けない。
--
-- security invoker のため audit_logs の RLS（admin/supervisor のみ SELECT 可）がそのまま効く。

-- action 列の索引（target_type は既存の idx_audit_logs_target(target_type, target_id) の先頭列で足りる）
create index if not exists idx_audit_logs_action on public.audit_logs (action);

-- =====================================================
-- アクション種別の一覧
-- =====================================================
create or replace function public.audit_log_distinct_actions()
returns table (value text)
language sql
stable
security invoker
set search_path = public
as $$
  with recursive walk as (
    select (select a.action from public.audit_logs a order by a.action limit 1) as value
    union all
    select (
      select a.action
      from public.audit_logs a
      where a.action > w.value
      order by a.action
      limit 1
    )
    from walk w
    where w.value is not null
  )
  select w.value from walk w where w.value is not null order by w.value;
$$;

-- =====================================================
-- 対象種別の一覧
-- =====================================================
create or replace function public.audit_log_distinct_target_types()
returns table (value text)
language sql
stable
security invoker
set search_path = public
as $$
  with recursive walk as (
    select (select a.target_type from public.audit_logs a order by a.target_type limit 1) as value
    union all
    select (
      select a.target_type
      from public.audit_logs a
      where a.target_type > w.value
      order by a.target_type
      limit 1
    )
    from walk w
    where w.value is not null
  )
  select w.value from walk w where w.value is not null order by w.value;
$$;

-- 実行権限:
-- 関数は CREATE 時に PUBLIC へ EXECUTE が自動付与され、さらに Supabase の
-- default privileges で anon/authenticated へ直接 grant される。両経路を剥奪してから
-- 必要なロールにだけ明示的に付与する（剥奪を書いただけでは塞がらないため）。
revoke execute on function public.audit_log_distinct_actions() from public, anon;
revoke execute on function public.audit_log_distinct_target_types() from public, anon;
grant execute on function public.audit_log_distinct_actions() to authenticated;
grant execute on function public.audit_log_distinct_target_types() to authenticated;
