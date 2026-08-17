-- =====================================================
-- 複数メイト契約（追加契約）の土台
--
-- 設計: docs/MULTI_MATE_REQUIREMENTS.md
--
--   persons                     … 人（LTV・トライアル権・ログインの単位）
--     └─ end_users (person_id)  … その人の「あるメイトとの関係」= 1契約
--
-- 既存コードの前提「1 end_user = 1メイト = 1ライブ契約」はそのまま真のまま維持し、
-- その上に「人」レイヤーだけを足す。受信トレイ・SLA・担当判定・チェックイン・
-- 配分は一切変更しない（LINE公式アカウントがメイトごとに分かれている実態に対応）。
--
-- 適用前確認（2026-08-17 実測）:
--   end_users 1件（line_user_id 重複なし）/ subscriptions 2件（うちライブ1件）
--   → 全行が「1人1契約」なので backfill は 1 end_user = 1 person で安全。
-- =====================================================

-- -----------------------------------------------------
-- 1. persons（人）
-- -----------------------------------------------------
create table if not exists public.persons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.persons is
  '人（自然人）。1人が複数メイトと契約できるため、end_users（=メイトとの関係1件）の上位に置く。LTV・トライアル権・ログインはこの単位。';

alter table public.persons enable row level security;
-- スタッフの閲覧のみ許可（書き込みは service_role 経由の業務処理に限定）。
drop policy if exists persons_select_staff on public.persons;
create policy persons_select_staff on public.persons
  for select to authenticated
  using (exists (select 1 from public.staff_profiles sp where sp.id = auth.uid()));

-- -----------------------------------------------------
-- 2. end_users.person_id
-- -----------------------------------------------------
alter table public.end_users
  add column if not exists person_id uuid references public.persons(id) on delete restrict;

comment on column public.end_users.person_id is
  'この関係行が属する人。同じ人が別メイトと契約すると person_id が同じ行が複数できる。';

-- backfill: 既存行はすべて「1人1契約」なので 1行 = 1人 を作る
do $$
declare
  r record;
  new_person uuid;
begin
  for r in select id from public.end_users where person_id is null loop
    insert into public.persons default values returning id into new_person;
    update public.end_users set person_id = new_person where id = r.id;
  end loop;
end $$;

-- person_id を渡さない挿入経路（LINEフォロー・管理画面からの作成・取込）が
-- NOT NULL 違反で落ちないよう、未指定なら自動で人を作る。
--
-- 「各挿入経路に person_id を書き足す」方式にすると、後から挿入経路が増えたときに
-- 必ず1つ書き忘れる（列挙の分裂）。DB側で構造的に埋めるほうが漏れない。
-- BEFORE INSERT はNOT NULL検査より前に走るため、NOT NULLと併用できる。
create or replace function public.end_users_ensure_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person uuid;
begin
  if new.person_id is null then
    insert into public.persons default values returning id into v_person;
    new.person_id := v_person;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_end_users_ensure_person on public.end_users;
create trigger trg_end_users_ensure_person
  before insert on public.end_users
  for each row execute function public.end_users_ensure_person();

alter table public.end_users alter column person_id set not null;

create index if not exists idx_end_users_person on public.end_users (person_id);

-- トリガー関数は end_users への INSERT 権限を持つロールから実行される。
-- 既定付与（PUBLIC / Supabase の default privileges）を剥がしたうえで、
-- 実際に INSERT する経路のロールへ明示的に付与する
-- （剥奪だけすると end_users への INSERT がすべて失敗する）。
revoke execute on function public.end_users_ensure_person() from public, anon;
grant execute on function public.end_users_ensure_person() to service_role, authenticated;

-- -----------------------------------------------------
-- 3. LINE UID の一意制約をメイト単位へ張り替える
--
-- LINEの userId はプロバイダー単位で同一のため、全メイトの公式アカウントが
-- 同一プロバイダー配下なら「同じUIDが複数の関係行に入る」。
-- 従来のグローバルUNIQUEのままだと2人目のメイトの行が作れない。
--
-- coalesce で NULL を実値化しているのが要点。素の複合UNIQUEは NULL を互いに
-- 異なる値として扱うため、未契約（assigned_cast_id is null）の見込み行が
-- 無制限に増えてしまう。
-- -----------------------------------------------------
alter table public.end_users drop constraint if exists end_users_line_user_id_key;

create unique index if not exists uq_end_users_line_uid_per_mate
  on public.end_users (
    line_user_id,
    coalesce(assigned_cast_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where line_user_id is not null;

comment on index public.uq_end_users_line_uid_per_mate is
  'LINE UIDはメイトごとに1行（未契約の見込み行は人につき1行）。旧 end_users_line_user_id_key の置き換え。';

-- -----------------------------------------------------
-- 4. 同一人物が同じメイトと二重に関係行を持たない
-- -----------------------------------------------------
create unique index if not exists uq_end_users_person_cast
  on public.end_users (person_id, assigned_cast_id)
  where assigned_cast_id is not null;

comment on index public.uq_end_users_person_cast is
  '1人につき1メイト1行。追加契約で同じメイトの行が二重に作られるのを防ぐ最終防衛線。';

-- -----------------------------------------------------
-- 5. merge_end_users は「別メイトの行」を統合してはならない
--
-- 既存の統合関数は同一人物の重複行（同じメイト）を1本化するためのもの。
-- 複数メイト対応後にこれを別メイトの行へ使うと、メイトBの会話・契約が
-- メイトAの行に吸い込まれて復元不能になる。ガードを入れる。
-- -----------------------------------------------------
-- 本体は 20260608030000 の定義をそのまま引き継ぎ、先頭のガードと
-- person の後始末だけを足す（付け替え対象テーブルを1つでも落とすと
-- 統合時にそのデータが CASCADE で消えるため、body は書き直さない）。
create or replace function public.merge_end_users(p_source uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_cast uuid;
  v_target_cast uuid;
  v_source_person uuid;
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

  -- 複数メイト対応のガード:
  -- 担当メイトが異なる行は「同じ人の別の契約」であって重複ではない。
  -- 統合するとメイトBの会話・契約がメイトAの行に吸い込まれ復元できない。
  select assigned_cast_id, person_id into v_source_cast, v_source_person
    from public.end_users where id = p_source;
  select assigned_cast_id into v_target_cast
    from public.end_users where id = p_target;
  if v_source_cast is not null and v_target_cast is not null and v_source_cast <> v_target_cast then
    raise exception 'cannot merge end_users assigned to different casts (% vs %). use link_end_user_persons to link the same person instead.',
      v_source_cast, v_target_cast;
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
  update public.response_metrics  set end_user_id = p_target where end_user_id = p_source;
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

  -- 参照されなくなった person は残さない
  delete from public.persons p
   where p.id = v_source_person
     and not exists (select 1 from public.end_users e where e.person_id = p.id);
end;
$$;

-- 関数のEXECUTE権限は既定付与（PUBLIC・Supabaseのdefault privileges）が残るため明示的に剥奪する。
revoke execute on function public.merge_end_users(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_end_users(uuid, uuid) to service_role;

-- -----------------------------------------------------
-- 6. link_end_user_persons: 別UIDで作られた行を同一人物に紐付ける
--
-- LINEのプロバイダーがメイトごとに分かれている場合、同じ人でもUIDが変わるため
-- システムは自動で同一人物と判定できない。管理画面からの手動紐付け用。
-- -----------------------------------------------------
create or replace function public.link_end_user_persons(p_end_user uuid, p_into_person uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cast uuid;
  v_old_person uuid;
begin
  select assigned_cast_id, person_id into v_cast, v_old_person
    from public.end_users where id = p_end_user;
  if not found then
    raise exception 'end_user not found';
  end if;
  if not exists (select 1 from public.persons where id = p_into_person) then
    raise exception 'person not found';
  end if;
  if v_old_person = p_into_person then
    return;
  end if;

  -- 統合先に同じメイトの行が既にあると uq_end_users_person_cast に当たる。
  -- 黙って失敗させず、何が衝突しているかを明示する。
  if v_cast is not null and exists (
    select 1 from public.end_users
     where person_id = p_into_person and assigned_cast_id = v_cast
  ) then
    raise exception 'the target person already has a relationship with cast %', v_cast;
  end if;

  update public.end_users set person_id = p_into_person where id = p_end_user;

  -- 参照されなくなった person は残さない
  delete from public.persons p
   where p.id = v_old_person
     and not exists (select 1 from public.end_users e where e.person_id = p.id);
end $$;

revoke execute on function public.link_end_user_persons(uuid, uuid) from public, anon, authenticated;
grant execute on function public.link_end_user_persons(uuid, uuid) to service_role;
