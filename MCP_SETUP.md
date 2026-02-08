# Stripe MCP セットアップガイド

## 概要

このプロジェクトには、Stripe APIにアクセスするためのMCP（Model Context Protocol）サーバーが含まれています。CursorのAIアシスタントからStripeのデータを直接取得・操作できるようになります。

## セットアップ手順

### 1. 依存関係の確認

以下のパッケージがインストールされていることを確認：

```bash
npm install
```

### 2. 環境変数の確認

`.env.local`に`STRIPE_SECRET_KEY`が設定されていることを確認してください。

### 3. Cursor設定ファイルの作成/更新

Cursorの設定ファイル（`~/.cursor/settings.json`）にMCPサーバーの設定を追加します。

#### 方法A: 新規作成（推奨）

```bash
mkdir -p ~/.cursor
cat > ~/.cursor/settings.json << 'EOF'
{
  "mcpServers": {
    "stripe": {
      "command": "npm",
      "args": [
        "run",
        "mcp:stripe",
        "--prefix",
        "/Users/freefree/システム開発関連/Rutinシステム"
      ],
      "env": {
        "STRIPE_SECRET_KEY": "sk_test_YOUR_STRIPE_SECRET_KEY_HERE"
      }
    }
  }
}
EOF
```

**重要**: `STRIPE_SECRET_KEY`の値は`.env.local`から取得して設定してください。

#### 方法B: 既存設定に追加

既に`~/.cursor/settings.json`が存在する場合：

1. ファイルを開く
2. `mcpServers`セクションを追加（既に存在する場合は`stripe`エントリを追加）
3. 上記の設定を追加

### 4. 環境変数から自動読み込み（推奨）

より安全な方法として、環境変数から読み込むスクリプトを使用することもできます：

```json
{
  "mcpServers": {
    "stripe": {
      "command": "sh",
      "args": [
        "-c",
        "source /Users/freefree/システム開発関連/Rutinシステム/.env.local && npm run mcp:stripe --prefix /Users/freefree/システム開発関連/Rutinシステム"
      ]
    }
  }
}
```

ただし、この方法はシェルによって動作が異なる場合があります。

### 5. Cursorの再起動

設定を反映するためにCursorを完全に再起動してください。

### 6. 動作確認

Cursorのチャットで以下を試してください：

```
Stripeでサブスクリプション一覧を取得して
```

または

```
サブスクリプションID sub_xxx の詳細を取得して
```

## 利用可能な機能

### サブスクリプション管理

- サブスクリプション情報の取得
- サブスクリプション一覧の取得（ステータス、顧客でフィルタ可能）
- サブスクリプションのキャンセル
- サブスクリプションの更新（プラン変更）

### 顧客管理

- 顧客情報の取得
- 顧客一覧の取得（メールアドレスで検索可能）

### 支払い管理

- 支払いインテント情報の取得
- Checkout Session情報の取得
- チャージ（支払い）一覧の取得

## トラブルシューティング

### MCPサーバーが認識されない

1. **設定ファイルの確認**
   ```bash
   cat ~/.cursor/settings.json
   ```

2. **JSON構文の確認**
   - カンマの位置
   - 引用符のエスケープ
   - 中括弧の対応

3. **パスの確認**
   - プロジェクトのパスが正しいか確認
   - 絶対パスを使用しているか確認

### 環境変数が読み込まれない

1. **直接値を設定**
   - `settings.json`に直接`STRIPE_SECRET_KEY`の値を設定

2. **.env.localの確認**
   ```bash
   grep STRIPE_SECRET_KEY .env.local
   ```

### サーバーが起動しない

1. **直接実行してテスト**
   ```bash
   cd /Users/freefree/システム開発関連/Rutinシステム
   npm run mcp:stripe
   ```

2. **エラーメッセージを確認**
   - 標準エラー出力にエラーが表示されます

3. **依存関係の確認**
   ```bash
   npm list @modelcontextprotocol/sdk stripe tsx
   ```

### Cursorのログを確認

1. `Help > Toggle Developer Tools`を開く
2. Consoleタブでエラーを確認
3. MCP関連のログを検索

## セキュリティ注意事項

⚠️ **重要**: 

- `STRIPE_SECRET_KEY`は機密情報です
- `.env.local`は`.gitignore`に含まれています
- `settings.json`に直接値を書く場合は、Gitにコミットしないよう注意してください
- 本番環境では、環境変数から読み込む方法を使用してください

## 参考リンク

- [MCP公式ドキュメント](https://modelcontextprotocol.io/)
- [Stripe API ドキュメント](https://stripe.com/docs/api)
