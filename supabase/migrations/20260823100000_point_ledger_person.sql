-- =====================================================
-- ポイント台帳を「人（person）」単位へ移行
--
-- 背景: 複数メイト契約対応で end_users は「人×メイトの関係行」になり、
-- ポイント残高（人の資産）を end_user_id 単位で集計すると、関係行ごとに
-- 残高が分裂する。暫定で「最古の関係行」に台帳を寄せていたが、
-- ギフト/ポイントのローンチ前に正式に person 参照へ移行する。
-- （docs/BUG_PATTERNS.md パターンJ: 集約レベルの取り違え）
-- =====================================================

-- 1) person_id 列の追加と backfill
alter table public.user_point_ledger
  add column if not exists person_id uuid references public.persons(id) on delete restrict;

update public.user_point_ledger l
   set person_id = e.person_id
  from public.end_users e
 where e.id = l.end_user_id
   and l.person_id is null;

-- 2) INSERT 時に end_user_id から自動導出するトリガー。
--    「各書き込み経路に person_id を書き足す」方式は経路が増えたときに必ず漏れる
--    （列挙の分裂）。DB側で構造的に埋める（end_users_ensure_person と同じ方針）。
create or replace function public.user_point_ledger_set_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.person_id is null then
    select person_id into new.person_id from public.end_users where id = new.end_user_id;
  end if;
  if new.person_id is null then
    raise exception 'user_point_ledger: person not found for end_user %', new.end_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_point_ledger_set_person on public.user_point_ledger;
create trigger trg_user_point_ledger_set_person
  before insert on public.user_point_ledger
  for each row execute function public.user_point_ledger_set_person();

alter table public.user_point_ledger alter column person_id set not null;

create index if not exists idx_user_point_ledger_person on public.user_point_ledger (person_id);

-- トリガー関数は台帳へ INSERT するロールから実行される。既定付与を剥がして明示付与
-- （剥奪だけすると台帳への INSERT がすべて失敗する）。
revoke execute on function public.user_point_ledger_set_person() from public, anon;
grant execute on function public.user_point_ledger_set_person() to service_role, authenticated;

-- 3) 残高集計RPC: 「この関係行の人」の残高を1呼び出しで返す。
--    呼び出し側が person_id を事前に知らなくてよく、並列クエリの形を崩さない。
--    集計式をアプリ各所に分散させない（単一の真実のソース）。
create or replace function public.point_balance_for_end_user(p_end_user uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(l.delta_points), 0)::bigint
    from public.user_point_ledger l
   where l.person_id = (select person_id from public.end_users where id = p_end_user);
$$;

revoke execute on function public.point_balance_for_end_user(uuid) from public, anon;
grant execute on function public.point_balance_for_end_user(uuid) to service_role, authenticated;
