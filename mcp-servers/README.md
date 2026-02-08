# Stripe MCP Server

Stripe APIへのアクセスを提供するMCP（Model Context Protocol）サーバーです。

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local`に`STRIPE_SECRET_KEY`が設定されていることを確認してください：

```bash
STRIPE_SECRET_KEY=sk_test_...
```

### 3. Cursorでの設定

Cursorの設定ファイル（`~/.cursor/settings.json`）に以下を追加してください：

```json
{
  "mcpServers": {
    "stripe": {
      "command": "npm",
      "args": ["run", "mcp:stripe", "--prefix", "/Users/freefree/システム開発関連/Rutinシステム"],
      "env": {
        "STRIPE_SECRET_KEY": "sk_test_..."
      }
    }
  }
}
```

**注意**: `STRIPE_SECRET_KEY`は実際の値に置き換えてください。環境変数から読み込む場合は、`.env.local`ファイルを読み込むか、直接値を設定してください。

### 4. Cursorの再起動

設定を反映するためにCursorを再起動してください。

## 利用可能なツール

### サブスクリプション関連

- `get_subscription`: サブスクリプション情報を取得
- `list_subscriptions`: サブスクリプション一覧を取得（フィルタ可能）
- `cancel_subscription`: サブスクリプションをキャンセル
- `update_subscription`: サブスクリプションを更新（プラン変更等）

### 顧客関連

- `get_customer`: 顧客情報を取得
- `list_customers`: 顧客一覧を取得

### 支払い関連

- `get_payment_intent`: 支払いインテント情報を取得
- `get_checkout_session`: Checkout Session情報を取得
- `list_charges`: チャージ（支払い）一覧を取得

## 使用例

Cursorのチャットで以下のように使用できます：

```
StripeでサブスクリプションID sub_xxx の情報を取得して
```

```
顧客ID cus_xxx のサブスクリプション一覧を取得して
```

```
サブスクリプション sub_xxx をキャンセルして
```

## トラブルシューティング

### MCPサーバーが起動しない

1. `STRIPE_SECRET_KEY`が正しく設定されているか確認
2. `npm run mcp:stripe`を直接実行してエラーを確認
3. Cursorのログを確認（`Help > Toggle Developer Tools`）

### 権限エラー

Stripe APIキーに適切な権限があるか確認してください。テスト環境では`sk_test_`で始まるキーを使用してください。

## 開発

MCPサーバーを直接実行してテスト：

```bash
npm run mcp:stripe
```

標準入出力（stdio）経由でMCPプロトコルで通信します。
