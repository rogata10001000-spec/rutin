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
