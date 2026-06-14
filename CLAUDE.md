# Rutin システム — Claude Code 引き継ぎドキュメント

このファイルは Claude Code が自動で読み込む設定ドキュメントです。
コードを編集する前に必ずこのファイルを読んでください。

---

## システム概要

**Rutin（ルティン）** は、継続が難しい人向けの **伴走型・習慣化サポートSaaS** です。

エンドユーザーは LINE を主チャネルとして担当メイト（キャスト）とやり取りし、
Stripe でサブスクリプション課金、ポイント・ギフトで感謝を送る仕組みを持ちます。

詳細は以下を参照:
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — システム構成・認証・主要フロー
- [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md) — DB テーブル・型定義・RLS の全体像
- [`docs/BUG_PATTERNS.md`](./docs/BUG_PATTERNS.md) — 再発防止パターン（必読）
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — デプロイ手順
- [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) — 運用・インシデント対応

---

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フレームワーク | Next.js 16（App Router）, React 19 |
| DB / 認証 | Supabase（PostgreSQL + Auth + Realtime + Storage） |
| 決済 | Stripe（サブスク + ワンタイム） |
| LINE 連携 | LINE Messaging API + LIFF |
| AI | Claude API（AI返信案） |
| メール | Resend |
| モニタリング | Sentry |
| デプロイ | Vercel（Cron含む） |
| テスト | Vitest（unit）, Playwright（e2e） |

---

## ディレクトリ構造

```
/
├── app/                    # Next.js App Router
│   ├── (admin)/            # スタッフ管理画面（Supabase Auth必須）
│   ├── (user)/             # エンドユーザー向けWeb（JWT Cookie認証）
│   ├── (cast)/             # キャスト専用ページ
│   ├── subscribe/          # 新規契約フロー（メイト選択→プラン→Stripe）
│   ├── liff/               # LIFF マイページ
│   ├── login/              # スタッフログイン
│   └── api/                # API Routes（Webhook / Cron / LIFF）
├── actions/                # Server Actions（ビジネスロジック中心）
├── components/             # UIコンポーネント（役割別サブディレクトリ）
├── lib/                    # 共通ライブラリ・外部連携
│   ├── supabase/           # DBクライアント（server.ts / client.ts / types.ts）
│   ├── auth.ts             # スタッフ認証 + エンドユーザーJWT
│   ├── stripe.ts           # Stripe連携
│   ├── line.ts             # LINE Messaging API
│   ├── calculations.ts     # SLA・Inbox優先度計算
│   ├── revenue-calculations.ts
│   └── env.ts              # 環境変数（Zod検証済みgetter）
├── hooks/                  # React カスタムフック
├── schemas/                # Zodバリデーションスキーマ
├── supabase/migrations/    # DBマイグレーション（YYYYMMDDHHMMSS_*.sql）
├── docs/                   # 運用・引き継ぎドキュメント
├── scripts/                # 運用スクリプト
└── tests/                  # unit / e2e テスト
```

---

## ユーザー種別と権限

### スタッフ（管理画面）

Supabase Auth（email/password）でログイン。`staff_profiles.role` で権限を管理。

| ロール | 権限 |
|--------|------|
| **admin** | 全機能（価格・精算・売上・LINEアカウント・税率・Webhook監視） |
| **supervisor** | ユーザー管理、解約対応、メイト管理、監査ログ閲覧 |
| **cast** | 自分の担当ユーザーのみ閲覧・返信、自分のプロフィール写真管理 |

```typescript
// lib/auth.ts の主要関数
getCurrentStaff()             // 現在のスタッフ情報取得
requireAdmin()                // admin のみ
requireAdminOrSupervisor()    // admin または supervisor
canAccessUser(endUserId)      // cast は担当ユーザーのみ
canSendMessage(endUserId)     // Shadow期間中の cast は送信不可
```

### エンドユーザー（エンドユーザーWeb）

Supabase Auth を **使わない**。3つの JWT 認証経路がある:

1. **LINE JWT** — Webhook が `?token=` 付き URL を返信 → middleware が Cookie 設定
2. **LIFF IDトークン** — `/api/liff/session` で検証 → Cookie 発行
3. **メールログイン** — Resend でワンタイムリンク送信 → `/account/auth?lt=` で検証

セッションCookie名: `rutin_user_session`（30分有効、httpOnly）
service_role クライアント経由でアクセス（エンドユーザー用 RLS なし）

---

## 主要な開発規約

### 環境変数

`process.env.XXX` を直接使わず、`lib/env.ts` の getter を使う:

```typescript
import { getServerEnv } from "@/lib/env";
const env = getServerEnv();
env.STRIPE_SECRET_KEY // ← Zod検証済み
```

### Supabase クライアント

```typescript
// サーバーサイド（Server Components / Actions / API Routes）
import { createServerSupabaseClient, createPrivilegedClient } from "@/lib/supabase/server";

const supabase = await createServerSupabaseClient(); // RLS付き（スタッフ認証）
const admin = createPrivilegedClient();              // service_role（Webhook・エンドユーザー処理）

// クライアントサイド
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
```

### Server Actions の戻り値

```typescript
// actions/types.ts
type Result<T> = { ok: true; data: T } | { ok: false; error: ActionErrorCode };

// 使い方: 失敗時は必ずクライアントにトーストを表示する
if (!result.ok) {
  showToast("エラーが発生しました", "error");
}
```

### DBマイグレーション

```
ファイル名: supabase/migrations/YYYYMMDDHHMMSS_description.sql
適用コマンド: npm run db:migrate  （= supabase db push）
```

- `DROP FUNCTION` ではなく `CREATE OR REPLACE FUNCTION` を使う
- RLS ポリシーは `DROP POLICY IF EXISTS + CREATE POLICY`
- スコープ絞り込みには必ず条件を付ける（`assigned_cast_id` / `line_user_id` 等）

### プルダウン（Select）

ネイティブの `<select>` は禁止。プロジェクトの共通 `Select` / `MultiSelect` コンポーネントを使う。

### テーブルUI

`<th>` には `whitespace-nowrap` を必ず付ける。操作列は `w-px whitespace-nowrap`。
横幅不足のテーブルは `overflow-x-auto` + `min-w-*`。

---

## 主要な npm スクリプト

```bash
npm run dev          # 開発サーバー起動
npm run build        # ビルド
npm run typecheck    # 型チェック（tsc --noEmit）
npm run lint         # ESLint
npm run test         # Vitest（unit）
npm run test:e2e     # Playwright（e2e）
npm run db:migrate   # DBマイグレーション適用（supabase db push）
npm run db:types     # Supabase型自動生成
```

---

## 実装後チェックリスト（必須）

コード変更後は以下を必ずこの順で実施:

- [ ] `npm run typecheck` がエラーなし
- [ ] `npm run build` が成功
- [ ] 影響する全ロール（admin / supervisor / cast / エンドユーザー）で動作確認
- [ ] 新しいマイグレーションを作成した場合は `npm run db:migrate` で適用済み
- [ ] 変更をコミット（日本語・明確なメッセージ）
- [ ] `git push` でリモートに反映

---

## よくあるバグパターン（必ず事前確認）

`docs/BUG_PATTERNS.md` に詳細あり。特に以下に注意:

- **サイレント失敗**: Server Action 失敗時はクライアントにエラーを必ず伝える
- **二重定義**: 金額・日数・URLは DB / env getter から取得（ハードコード禁止）
- **Webhookの副作用ギャップ**: 同一ビジネスイベントの処理は1関数に集約
- **クエリパラメータ喪失**: `redirect()` 時は searchParams を引き継ぐ
- **RLS upsert禁止**: RLSで SELECT 制限テーブルへの `.upsert()` → `.insert()` / `.update()` で分岐

---

## 外部サービス連携

| サービス | 用途 | 設定ファイル |
|----------|------|-------------|
| LINE Messaging API | チャット・リッチメニュー・Webhook | `lib/line.ts`, `lib/line-webhook-handler.ts` |
| LINE LIFF | エンドユーザーの契約管理Web | `lib/line-id-token.ts` |
| Stripe | サブスク・ポイント課金・Webhook | `lib/stripe.ts`, `lib/stripe-subscription-sync.ts` |
| Resend | メールログイン・通知 | `lib/email.ts`, `lib/email-login.ts` |
| Claude API | AI返信案生成 | `lib/ai.ts` |
| Sentry | エラー監視 | `sentry.*.config.ts` |

---

## 注意事項

- `src/` ディレクトリは存在しない。`app/` がルートエントリポイント
- パスエイリアス: `@/*` → プロジェクトルート
- エンドユーザーは Supabase Auth を使わない（`end_users` テーブルで管理）
- スタッフのセッションは RLS で自動的に絞り込まれる
- `createPrivilegedClient()` は **サーバーサイドのみ** で使用する
- ビルドエラーが残ったままプッシュしない
- 型エラーを `@ts-ignore` で黙らせない（根本修正する）
