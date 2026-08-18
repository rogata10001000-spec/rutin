# 再発防止: バグパターン一覧

サブスク導線デバッグ（2026）で見つかった問題を抽象化したもの。新機能・Webhook・Server Action 追加時のチェックリストとして使う。

## パターン A: サイレント失敗（Silent Failure）

**定義:** `Result { ok: false }` や API エラーを UI に伝えず、空データ・無反応・`return null` で終わる。

**典型例:**
- Server Action が失敗しても redirect しない（旧 plan checkout）
- クライアントが `if (result.ok)` のみで、失敗時トーストなし

**チェック:**
- [ ] フォーム / `"use server"` は失敗時に `redirect(?error=)` または `useActionState` で表示
- [ ] クライアントの `loadX()` は `!result.ok` でトーストまたはエラー state
- [ ] 空リストと「取得失敗」を文言で区別できるか

**対策コード:** `lib/subscribe-checkout-errors.ts`, 各 Dialog の `showToast` on load failure

---

## パターン B: 設定の二重定義（Config Drift）

**定義:** 環境変数・DB と UI / 別モジュールのハードコードが一致しない。

**典型例:**
- `TRIAL_PERIOD_DAYS=14` だが UI は「7日間」固定
- `plan_prices` テーブルと `STRIPE_PRICE_*` env の乖離

**チェック:**
- [ ] 表示用の日数・金額・URL は `lib/trial.ts` / `getServerEnv()` / DB から取得
- [ ] スクリプト・テストのマジックナンバーは env デフォルトとコメントで紐付け

---

## パターン C: Webhook 経路の副作用ギャップ（Divergent Side Effects）

**定義:** 同一ビジネスイベントに対し、イベント種別やフォールバック経路によって DB・外部 API の更新が揃わない。

**典型例:**
- `checkout.session.completed` のみ `cast_assignments` + リッチメニュー
- `subscription.created` フォールバックは DB のみ
- LINE `follow` は welcome、`message` 新規は welcome なし

**チェック:**
- [ ] 新規契約・新規友だちの副作用は **1 関数**（`syncNewSubscriptionSideEffects`, `sendLineUncontractedOnboarding`）に集約
- [ ] フォールバック経路でも同関数を呼ぶ

---

## パターン D: Webhook の過剰 500（Retry Storm）

**定義:** 再試行しても直らない条件で `throw` し、Stripe/LINE が無限リトライする。

**典型例:**
- メタデータ欠落、ユーザー未存在、 payout rule 未設定

**チェック:**
- [ ] 永続的エラーは `{ skipped: true, reason }` + `logger.warn`
- [ ] 一時的 DB 障害のみ `throw` → 500

---

## パターン E: リダイレクトによるクエリ喪失（Lost Query Params）

**定義:** `redirect()` や `<a href>` が固定パスで、フィルタ・フラグ・トークンを落とす。

**典型例:**
- `/subscribe?canceled=true` → `/subscribe/cast` で `canceled` 消失
- プラン画面の戻るリンクが `gender` を落とす

**チェック:**
- [ ] ルート集約 redirect は `searchParams` を引き継ぐ（`buildSubscribeCastUrl`）
- [ ] 導線内リンクは `useSearchParams` / サーバー `searchParams` で付与

---

## パターン F: 集計条件の不一致（Inconsistent Filters）

**定義:** 一覧と確定処理で同じビジネスルール（キャパシティ、有効ステータス）の SQL が違う。

**典型例:**
- 一覧: `status != incomplete`
- Checkout: `status NOT IN (incomplete, canceled)`

**チェック:**
- [ ] キャパシティ・重複契約チェックは定数または共有関数で 1 定義

---

## パターン G: スキーマ列の未書き込み（Schema Ghost Column）

**定義:** DB に列があるがアプリのどの経路も書かない。

**典型例:**
- `trial_end_at` が Webhook で未設定

**チェック:**
- [ ] マイグレーション追加時に「誰がいつ書くか」を Webhook / Action に実装

---

## パターン H: 成功 UI と実データの乖離（Facade Success）

**定義:** 外部 API（Stripe）成功だけ見て、DB / Webhook 完了を確認しない。

**チェック:**
- [ ] 完了画面は trial / 金額などビジネス文脈を表示
- [ ] 運用は `/admin/webhooks` で processed を確認

---

## パターン I: 変更スコープ未検証の認可（Unscoped Mutation / Privilege Escalation）

**定義:** 「誰が・どの行を触れるか（操作可否）」は検証するが、「どの列を・どんな値にできるか（変更の中身）」を制約していない。結果、権限のない列（`role` / `active` / `status` / 価格 / ポイント / `assigned_cast_id` / `is_blocked` 等）を書き換えられる＝権限昇格・データ改ざん。

**現れ方（3型）:**
- **I-a. RLS の `UPDATE` で `WITH CHECK` 省略**: Postgres は省略時 `USING` を流用する。`USING` が**更新で不変な識別子**（`id = auth.uid()` 等）だけで満たされると、他の特権列を自由に変更できてしまう。
  - 実例: `staff_profiles_update` が `using(id = auth.uid() or is_admin())` のみ → cast が自分の行の `role='admin'` に書き換え可能だった。
- **I-b. no-op な認可**: `with check (true)` / `... or true` / `using (true)`（書き込み系）。
  - 実例: `audit_logs_insert (with check true)` = 監査ログ偽造、`ai_drafts_insert (... or true)` = 無制限挿入。
- **I-c. アプリ層の Mass Assignment**: サーバーアクションがアクセス可否だけ確認し、クライアント入力の列を**allow-list せず**そのまま `update` に流す（`.update(parsed.data)` / `.update({...input})`）。

**安全な形（重要な判定基準）:**
- RLS UPDATE の `USING` が**ロールベース**（`is_admin()` 等、行の列値に依存しない）なら安全。
- `USING` が**可変の所有列**（`cast_id` / `end_user_id` / `is_global` 等）を参照していれば、`WITH CHECK` 省略時の USING 流用は**むしろ保護的**（別所有者へ付け替えるとチェック失敗）。→ `memos` / `cast_photos` / `message_templates` はこれで安全。
- **危険なのは「USING が不変の識別子(`id`)だけ ＋ 別の特権列が自由に可変」の組み合わせ**のみ。

**チェック:**
- [ ] `UPDATE`/`FOR ALL` の RLS は、識別子ベースなら**必ず `WITH CHECK` を明示**し、特権列の変更を禁止する（または UPDATE を admin 限定にし、本人編集は service_role の Server Action で列を限定する）
- [ ] 書き込み系ポリシーに `with check (true)` / `or true` / `using (true)` を置かない
- [ ] サーバーアクションの `update` は**列を明示**（`parsed.data` の丸ごと流し込み禁止）。role/status/価格/points/assigned_cast_id/is_blocked/active 等は該当ロールのみ設定可
- [ ] INSERT ポリシーは所有者列（`created_by`/`requested_by`/`staff_id`）を `= auth.uid()` に固定（なりすまし防止）

## パターン J: 集約レベルの取り違え（Row Grain vs Person Grain）

**2026-08-17 複数メイト対応の再監査で確立。** `end_users` が「人」から「人×メイトの関係」に変わり、
**行の属性と人の属性が分離**した。行単位のイベント・状態だけを見て人単位の資源を読み書きすると、
複数契約者でだけ静かに壊れる（1契約者では行=人なので露見しない）。

**事例:**
- 1契約の解約で共通LINEのリッチメニューを未契約用へ戻した（他のライブ契約が残っているのに）
- ステップ配信が「行が incomplete」だけで対象を決め、契約者の見込み行に新規向け勧誘が届いた
- ブロックを1行だけに設定し、別メイトの画面では未ブロックに見える非対称ができた
- LINE表示名・写真（UID=人の属性）を1行だけ更新し、同じ人が別々の名前で並んだ

**人単位の資源・属性（全行へ反映 or 人で判定）:** リッチメニュー / ブロック / トライアル権 /
LINE表示名・写真 / メール・ログイン / ポイント（ローンチ前に person_id 参照へ移行） /
勧誘・リカバリ配信の対象判定 / LTV・実人数の集計

**行単位のままが正しいもの:** 会話・SLA・チェックイン・リスク・担当・配分・売上帰属・AI下書き

**チェック:**
- [ ] `end_users` の状態・イベントを起点に副作用（メニュー切替・配信・通知・遮断）を書くとき、
      その資源は行と人のどちらの単位か言語化したか
- [ ] 人単位なら `person_id` で全行を読んで判定したか（`getLiveContractedCastIds` / `getPersonIdForEndUser`）
- [ ] 判定に失敗したときどちらへ倒すか決めたか（例: メニュー戻しは「契約が残っている」側へ）

## パターン K: 縮退ケース（N=1）の暗黙挙動の喪失

**1:1 を 1:N に一般化すると、「どのケースでも同じ1行に落ちる」ことで暗黙に成立していた挙動が
選択問題に変わる。** 選択規則を明示的に列挙しないと、列挙から漏れたケースが「該当なし→新規作成」や
「該当なし→新規向け文言」に落ち、既存客が新規客として扱われる。

**事例:**
- ガード（shouldRejectAsWrongMate）を撤去した際、その中に埋まっていた例外条項
  （担当変更直後の会話アカウント受け入れ）まで一緒に消えた
- 契約者が共通アカウントへ送ると、従来は唯一の行に載っていたのが見込み行の新規作成に化けた
- メッセージ経路には「契約者への追加契約案内」を入れたが、フォロー経路が漏れて
  友だち追加の瞬間だけ新規向けwelcomeが届いた

**チェック:**
- [ ] 分岐・ガードを撤去/置換するとき、旧実装の**例外条項・但し書き**をすべて列挙して
      新実装での行き先を決めたか（主動作だけ移植して例外を落とすのが典型）
- [ ] 着地先の選択規則は「該当なし」も含めて全ケースを列挙したか（pickRelationshipRow に集約）
- [ ] 同じ判定が必要な**兄弟経路**（follow/message/postback、作成/更新/複製）へ同時に適用したか

## パターン L: 一意性前提の残存クエリ（Stale Cardinality Assumption）

**UNIQUE制約を緩めたら、その列で `.single()` / `.maybeSingle()` している全消費箇所が時限爆弾になる。**
2行目ができた瞬間にエラーになり、エラー破棄（`const { data } = ...`）と組み合わさると
「ユーザーが見つかりません」「セッション縮退」として静かに壊れる。

**事例:** `end_users.line_user_id` のグローバルUNIQUEをメイト単位に緩めた後、
LIFFセッション・ギフト/ポイント・管理画面のユーザー作成に `.eq("line_user_id").single()` が残存。

**チェック:**
- [ ] 一意性を変えたら、その列での単一行取得を**機械的に**全列挙したか
      （`settings-consistency.test.ts` の P6 が構造検査として常設）
- [ ] UIDからの解決は `lib/person.ts` に一本化されているか（各所で直接クエリしない）

## パターン M: 条件付き書き込みの0件成功（Zero-Row Conditional Write）

**`.update().eq(...).is(...)` の条件付き書き込みは、条件に合う行が無いと「0件更新」で
エラーなく成功する。** 直後のコードが「書けた前提」で進むと、並行処理に負けた側が
別の実体を自分のものとして扱う（決済の紐付け取り違えまで起きうる）。

**事例:** 見込み行のメイト昇格。並行する別メイトの決済が先に昇格させると0件更新になり、
確認しないと別メイトの行を自分の関係行として返していた。

**冪等な best-effort 書き込み（line_followed_at 補完・email捕捉）は0件でよい。**
「書けたかどうかで後続が分岐する」書き込みだけが対象。

**チェック:**
- [ ] 条件付きUPDATEの後続が結果に依存するなら `.select("id")` で行数を確認したか
- [ ] 0件だったときのフォールバック（読み直し・新規作成・中断）を決めたか
