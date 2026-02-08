#!/bin/bash

# Stripe MCP設定ファイルを自動作成するスクリプト

set -e

PROJECT_DIR="/Users/freefree/システム開発関連/Rutinシステム"
CURSOR_SETTINGS="$HOME/.cursor/settings.json"
ENV_FILE="$PROJECT_DIR/.env.local"

# .env.localからSTRIPE_SECRET_KEYを読み込む
if [ -f "$ENV_FILE" ]; then
  STRIPE_KEY=$(grep "^STRIPE_SECRET_KEY=" "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
else
  echo "エラー: .env.localファイルが見つかりません"
  exit 1
fi

if [ -z "$STRIPE_KEY" ]; then
  echo "エラー: STRIPE_SECRET_KEYが.env.localに見つかりません"
  exit 1
fi

# Cursor設定ディレクトリを作成
mkdir -p "$HOME/.cursor"

# 既存の設定ファイルがあるか確認
if [ -f "$CURSOR_SETTINGS" ]; then
  echo "既存の設定ファイルが見つかりました: $CURSOR_SETTINGS"
  echo "手動でmcpServersセクションを追加してください。"
  echo ""
  echo "追加する設定:"
  echo "---"
  cat << EOF
  "mcpServers": {
    "stripe": {
      "command": "npm",
      "args": [
        "run",
        "mcp:stripe",
        "--prefix",
        "$PROJECT_DIR"
      ],
      "env": {
        "STRIPE_SECRET_KEY": "$STRIPE_KEY"
      }
    }
  }
EOF
  echo "---"
else
  # 新規作成
  cat > "$CURSOR_SETTINGS" << EOF
{
  "mcpServers": {
    "stripe": {
      "command": "npm",
      "args": [
        "run",
        "mcp:stripe",
        "--prefix",
        "$PROJECT_DIR"
      ],
      "env": {
        "STRIPE_SECRET_KEY": "$STRIPE_KEY"
      }
    }
  }
}
EOF
  echo "✅ Cursor設定ファイルを作成しました: $CURSOR_SETTINGS"
  echo ""
  echo "次のステップ:"
  echo "1. Cursorを再起動してください"
  echo "2. Cursorのチャットで「Stripeでサブスクリプション一覧を取得して」と試してください"
fi
