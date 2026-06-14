# Rutin システムアーキテクチャ

## 全体構成

```
┌─────────────────────────────────────────────────────────────────┐
│                      Next.js 16 App Router                       │
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  Server          │  │  Server          │  │  API Routes   │  │
│  │  Components      │  │  Actions         │  │  (Webhook /   │  │
│  │  （データ取得）   │  │  （書き込み処理） │  │  Cron / LIFF）│  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘  │
│           └─────────────────────┼───────────────────── ┘         │
│                                 ▼                                 │
│                    ┌────────────────────────┐                    │
│                    │  lib/ （共通ライブラリ） │                    │
│                    └────────────┬───────────┘                    │
└────────────────────────────────┼────────────────────────────────┘
                                 ▼
          ┌──────────────────────┼─────────────────────┐
          ▼                      ▼                     ▼
     Supabase              LINE API              Stripe API
   (PostgreSQL)        (Messaging/LIFF)       (Subscription)
          │
          ├── RLS（スタッフ認証時）
          ├── Realtime（チャットリアルタイム更新）
          └── Storage（キャスト写真）
```

## ルートグループ構成

Next.js App Router のルートグループ（`(グループ名)/`）で役割を分離しています。

| ルートグループ | URL パターン | 認証方式 | 主な機能 |
|----------------|-------------|---------|---------|
| `(admin)` | `/inbox`, `/chat/*`, `/users/*`, `/admin/*` | Supabase Auth（スタッフ） | 管理画面全般 |
| `(user)` | `/account/*`, `/points/*`, `/help/*` | JWT Cookie（エンドユーザー） | 契約・プラン管理 |
| `(cast)` | `/my-photos/*` | Supabase Auth（cast ロール） | キャスト写真管理 |
| `subscribe/` | `/subscribe/*` | LINE トークン（一時） | 新規契約フロー |
| `liff/` | `/liff/mypage` | LIFF IDトークン → Cookie | LINEマイページ |
| `login/` | `/login` | — | スタッフログイン |

## 認証フロー

### スタッフ認証

```
スタッフ → /login → Supabase Auth（email/password）
     → auth.users + staff_profiles.role で権限確定
     → middleware が (admin) グループの全ページを保護
     → lib/auth.ts の requireAdmin() 等でページ/Action ごとに再検証
```

**RLS ヘルパー関数（PostgreSQL）:**

```sql
get_current_staff_role()           -- 現在のロール
is_admin()                         -- admin のみ
is_admin_or_supervisor()           -- admin or supervisor
is_assigned_to_user(user_id)       -- 担当キャストか
is_shadow_for_user(user_id)        -- Shadow 期間中か
```

### エンドユーザー認証（3経路）

```
1. LINE JWT（メイン）
   LINEメッセージ → Webhook → generateUserSessionToken()
   → `?token=` 付き URL を返信 → middleware で Cookie 設定
   → /account/*, /points/* にアクセス可能

2. LIFF（LINE アプリ内）
   LIFF起動 → IDトークン取得 → POST /api/liff/session
   → Supabase でトークン検証 → Cookie 発行

3. メールログイン
   /account/login でメール入力 → Resend でリンク送信
   → /account/auth?lt=<token> でトークン検証 → Cookie 発行
```

Cookie: `rutin_user_session`（httpOnly, SameSite=Lax, 30分有効）

## データフロー

### チャット（LINEメッセージ受信）

```
LINE ユーザー送信
  → LINE Messaging API
  → POST /api/webhooks/line（または /api/webhooks/line/[accountId]）
  → lib/line-webhook-handler.ts
    → messages テーブルに保存（direction: "in"）
    → response_metrics に未返信記録
    → スタッフ向け Web Push 通知
  → スタッフが /chat/[id] で確認
  → MessageComposer から Server Action
    → messages テーブルに保存（direction: "out"）
    → LINE API で送信
    → response_metrics を更新
```

### 新規契約フロー

```
LINE フォロー（または /subscribe への誘導）
  → /subscribe/cast  メイト選択
  → /subscribe/plan  プラン・価格選択
  → Stripe Checkout 起動（Server Action）
  → Stripe Checkout 完了
  → /subscribe/complete  完了画面
  → Stripe Webhook: checkout.session.completed
    → subscriptions テーブル更新
    → end_users.status → "active"
    → cast_assignments 記録
    → LINE リッチメニュー設定
    → subscription_lifecycle_events 記録
```

### Stripe 課金サイクル

```
毎月 Stripe が invoice 発行
  → Stripe Webhook: invoice.payment_succeeded
    → revenue_events に売上記録
    → payout_calculations で配分計算
  → 月次精算バッチ（admin 操作）
    → settlement_batches + settlement_items 生成
    → status: draft → approved → paid
```

### SLA アラート（Cron）

```
Vercel Cron: GET /api/jobs/sla-alert（5分毎）
  → lib/calculations.ts で未返信ユーザーの SLA を計算
  → SLA 超過スタッフに Web Push 通知
```

## 主要コンポーネント構成

### 管理画面（スタッフ）

```
AppShell（layout）
  └── SideNav（ロール別メニュー）
      ├── /inbox → InboxList + InboxFilters + InboxAutoRefresh
      ├── /chat/[id] → ChatContainer
      │     ├── MessageList（Realtime購読）
      │     ├── MessageComposer（テンプレート・AI返信案）
      │     └── MemoEditor
      ├── /users → UserTable + UserFilters
      ├── /users/[id] → UserDetail（ステータス・タグ・担当変更）
      └── /admin/* → 各管理画面（staff / pricing / settlements / revenue 等）
```

### エンドユーザー向けWeb

```
/subscribe/* → 契約フロー（CastList → PlanSelector → Stripe Checkout）
/account/plan → PlanManager（プラン変更・解約予約）
/account/login → EmailLoginForm
/liff/mypage → LiffMyPageClient（LIFF環境専用）
/points → PointPurchaseList（Stripe one-time）
```

## リアルタイム更新

チャット画面の新着メッセージは Supabase Realtime で購読:

```typescript
// hooks/useMessageRealtime.ts
supabase
  .channel(`messages:${userId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `end_user_id=eq.${userId}`
  }, handler)
  .subscribe()
```

## メイト別 LINE 公式アカウント

1 メイト = 1 LINE 公式アカウント の構成:

```
line_official_accounts テーブル
  ├── channel_secret（暗号化保存）
  ├── channel_access_token（暗号化保存）
  └── cast_id（担当キャスト）

/api/webhooks/line/[accountId]  ← アカウント別Webhook
lib/line-accounts.ts            ← 暗号化・復号
lib/crypto.ts                   ← AES-256-GCM
```

## Inbox 優先度計算

`lib/calculations.ts` で以下の優先度スコアを計算し、受信トレイをソート:

- SLA 残り時間（プランの `reply_sla_minutes` 基準）
- 未報告（チェックインなし）日数
- 誕生日
- 一時停止ペナルティ（`paused_priority_penalty`）
- プラン優先度（`plans.priority_level`）

## セキュリティ考慮事項

- `SUPABASE_SERVICE_ROLE_KEY` はサーバーサイドのみ（`createPrivilegedClient()`）
- LINE Channel Secret / Access Token は AES-256-GCM で暗号化して DB 保存
- LINE Webhook 署名検証（`x-line-signature` ヘッダー）
- Stripe Webhook 署名検証（`stripe-signature` ヘッダー）
- Cron エンドポイントは `CRON_SECRET` で認証
- エンドユーザーJWT は `LINE_USER_TOKEN_SECRET` で署名（30分有効）
- `@ts-ignore` 禁止・ビルドエラー残存禁止
