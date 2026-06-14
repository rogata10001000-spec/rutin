# Rutin データモデル

型定義の正式ソースは `lib/supabase/types.ts` です（手動定義・800行超）。
このファイルは全体像を把握するためのリファレンスです。

---

## Enum 型

```typescript
type StaffRole = "admin" | "supervisor" | "cast"
type PlanCode = "light" | "standard" | "premium"
type SubscriptionStatus = "trial" | "active" | "past_due" | "paused" | "canceled" | "incomplete"
type CheckinStatus = "circle" | "triangle" | "cross"        // ◯/△/×
type MessageDirection = "in" | "out"
type AiDraftType = "empathy" | "praise" | "suggest"
type SettlementStatus = "draft" | "approved" | "paid"
type PointReason = "purchase" | "gift_redeem" | "refund" | "chargeback" | "admin_adjust"
type RevenueEventType = "gift_redeem" | "subscription_monthly" | "refund" | "chargeback" | "breakage"
type PayoutRuleType = "gift_share" | "subscription_share"
type PayoutScopeType = "global" | "cast" | "cast_gift" | "cast_gift_category" | "cast_plan"
type SubscriptionLifecycleEventType =
  | "line_follow" | "trial_start" | "subscribe" | "plan_change"
  | "cancel_scheduled" | "cancel" | "resume"
```

---

## テーブル一覧（29テーブル）

### コアエンティティ

#### `staff_profiles`
スタッフ（admin / supervisor / cast）の情報。`auth.users` と 1:1。

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | uuid | auth.users.id と同一 |
| `role` | StaffRole | admin / supervisor / cast |
| `display_name` | text | 表示名 |
| `active` | boolean | 有効/無効 |
| `capacity_limit` | int? | 最大担当ユーザー数 |
| `accepting_new_users` | boolean | 新規受付中か |
| `supervisor_id` | uuid? | 担当スーパーバイザー |
| `gender` | StaffGender? | female / male / other |
| `birth_date` | date? | 誕生日 |
| `public_profile` | text? | 公開プロフィール（メイト選択画面） |

#### `end_users`
エンドユーザー（LINE 利用者）。Supabase Auth は使わない。

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | uuid | |
| `line_user_id` | text | UNIQUE |
| `nickname` | text | ニックネーム |
| `line_display_name` | text? | LINE表示名 |
| `line_picture_url` | text? | LINEアイコンURL |
| `email` | text? | メールアドレス |
| `status` | SubscriptionStatus | |
| `plan_code` | text | → plans |
| `assigned_cast_id` | uuid? | → staff_profiles |
| `primary_line_account_id` | uuid? | → line_official_accounts |
| `trial_end_at` | timestamptz? | トライアル終了日時 |
| `tags` | text[] | タグ一覧 |
| `paused_priority_penalty` | int | 一時停止ペナルティ |

#### `line_official_accounts`
メイト別 LINE 公式アカウント。

| カラム | 説明 |
|--------|------|
| `cast_id` | 担当キャスト（null=デフォルト） |
| `is_default` | デフォルトアカウントか |
| `channel_secret_encrypted` | AES-256-GCM 暗号化 |
| `channel_access_token_encrypted` | AES-256-GCM 暗号化 |
| `rich_menu_uncontracted_id` | 未契約者向けリッチメニュー |
| `rich_menu_contracted_id` | 契約者向けリッチメニュー |

### 契約・課金

#### `plans`
プランマスタ。

| カラム | 説明 |
|--------|------|
| `plan_code` | PK: light / standard / premium |
| `reply_sla_minutes` | SLA（返信期限）分数 |
| `sla_warning_minutes` | SLA 警告発火分数 |
| `priority_level` | Inbox 優先度スコア用 |
| `capacity_weight` | キャパシティ計算係数 |

#### `plan_prices`
デフォルト価格。

#### `cast_plan_price_overrides`
キャスト別価格上書き。

#### `subscriptions`
Stripe サブスクリプション同期。

| カラム | 説明 |
|--------|------|
| `stripe_customer_id` | |
| `stripe_subscription_id` | |
| `status` | SubscriptionStatus |
| `plan_code` | |
| `cancel_at_period_end` | 期末解約フラグ |

#### `subscription_lifecycle_events`
マーケ分析用のライフサイクルイベント。

### コミュニケーション

#### `messages`
LINE 双方向メッセージ。

| カラム | 説明 |
|--------|------|
| `direction` | in（受信）/ out（送信） |
| `body` | 本文 |
| `sent_by_staff_id` | 送信者スタッフ ID |
| `sent_as_proxy` | 代理送信フラグ |
| `line_account_id` | → line_official_accounts |

**Realtime 購読対象**: `useMessageRealtime` フックで購読。

#### `checkins`
日次チェックイン（◯/△/×）。LINE リッチメニュー postback で記録。

#### `memos` + `memo_revisions`
スタッフが書く担当ユーザーへのメモ。`memo_revisions` で更新履歴を保持。

#### `response_metrics`
未返信の SLA 計測。メッセージ受信時に記録、返信時に更新。

#### `message_templates`
チャットで使える定型メッセージテンプレート。

### ポイント・ギフト

#### `point_products`
ポイント購入商品（Stripe Price ID と紐付け）。

#### `user_point_ledger`
ポイント台帳（残高 = SUM(delta_points) per end_user_id）。

#### `gift_catalog`
ギフト商品マスタ（現在 MVP 対象外・準備中）。

#### `gift_sends`
ギフト送信履歴。

### 売上・精算

#### `revenue_events`
売上認識イベント（サブスク月次・ギフト等）。

| カラム | 説明 |
|--------|------|
| `event_type` | RevenueEventType |
| `amount_excl_tax_jpy` | 税抜金額 |
| `tax_rate_id` | → tax_rates |
| `amount_incl_tax_jpy` | 税込金額 |

#### `tax_rates`
税率マスタ。`effective_from` で時系列管理。

#### `payout_rules`
配分ルール（グローバル・キャスト別・ギフト種別別等）。

#### `payout_calculations`
配分計算結果（revenue_event ごと）。

#### `settlement_batches` + `settlement_items`
月次精算バッチ。`status`: draft → approved → paid。

### 運用・監査

#### `audit_logs`
スタッフ操作の監査ログ。

#### `webhook_events`
LINE / Stripe Webhook の冪等処理管理。
`status`: processing → processed / failed。

#### `cast_assignments`
担当変更履歴（改ざん防止・Shadow 期間管理）。

| カラム | 説明 |
|--------|------|
| `shadow_until` | Shadow 期間終了まで旧キャストの閲覧のみ |

#### `cast_photos`
キャストプロフィール写真（Supabase Storage と紐付け）。

### AI 機能

#### `ai_draft_requests` + `ai_drafts`
AI 返信案リクエストと生成結果（empathy / praise / suggest）。
1日の利用上限: `AI_DRAFT_DAILY_LIMIT` 環境変数。

#### `shadow_drafts`
Shadow 期間中の下書き（送信はできないが保存は可）。

### 通知

#### `staff_push_subscriptions`
スタッフの Web Push 購読情報（endpoint / p256dh / auth）。

#### `staff_thread_reads`
スタッフの既読管理（未読バッジ計算用）。

### その他

#### `risk_flags`
リスクフラグ（将来拡張・現在は未使用に近い）。

#### `birthday_congrats`
誕生日メッセージ送信記録（重複送信防止）。

#### `user_login_tokens`
メールログイン用のワンタイムトークン（SHA-256 ハッシュ保存）。

---

## RLS（Row Level Security）の概要

### スタッフ向けテーブル

RLS が有効。PostgreSQL ヘルパー関数で制御:

```sql
-- admin はすべて操作可
-- supervisor は staff_profiles を読める
-- cast は自分の担当ユーザーのみ
is_assigned_to_user(user_id) -- cast の担当チェック
is_admin_or_supervisor()
is_admin()
```

### エンドユーザー向けテーブル

`end_users` 等のエンドユーザー系テーブルは RLS なし。
サーバーサイドから `createPrivilegedClient()`（service_role）経由でアクセス。

---

## 重要な制約

- `end_users.line_user_id` は UNIQUE
- `webhook_events.(provider, event_id)` は UNIQUE（冪等処理）
- `cast_assignments` は INSERT のみ（改ざん防止）
- `user_point_ledger` は残高をアプリで SUM 計算（UPDATE/DELETE 禁止）
- UUID カラムに空文字を混入させない（INSERT 前にバリデーション）
