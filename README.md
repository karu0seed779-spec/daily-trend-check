# 毎日トレンドチェック → Slack通知（自動化）

Claude API（Web検索ツール）で毎日トレンドを調査し、GitHub Actionsで定時実行してSlackに通知する仕組みです。

## 構成

```
.
├── .github/workflows/daily-trend-check.yml   # 毎日実行するワークフロー
├── scripts/daily-trend-check.js              # 調査 → Slack投稿を行うスクリプト
└── README.md
```

## セットアップ手順

### 1. このフォルダをGitHubリポジトリにする

- GitHubで新しいリポジトリを作成（Public/Privateどちらでも可。Privateの場合もGitHub Actionsは無料枠内で利用できます）
- このフォルダの中身をそのままpush

```bash
git init
git add .
git commit -m "init: daily trend check bot"
git branch -M main
git remote add origin https://github.com/<あなたのアカウント>/<リポジトリ名>.git
git push -u origin main
```

### 2. Anthropic APIキーを取得

1. https://console.anthropic.com/ にログイン
2. 「API Keys」からキーを発行
3. Console上で組織管理者がWeb検索ツールを有効化している必要があります（「Web search」の設定項目を確認してください）

### 3. Slack Incoming Webhook URLを取得

1. https://api.slack.com/apps で「Create New App」→「From scratch」
2. 通知したいSlackワークスペースを選択
3. 左メニュー「Incoming Webhooks」を有効化 → 「Add New Webhook to Workspace」
4. 通知先チャンネルを選んで発行されたWebhook URL（`https://hooks.slack.com/services/...`）をコピー

### 4. GitHub Secretsに登録

リポジトリの `Settings` → `Secrets and variables` → `Actions` → `New repository secret` で以下を登録：

| Secret名 | 値 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropicで発行したAPIキー |
| `SLACK_WEBHOOK_URL` | Slackで発行したWebhook URL |

### 5. 動作確認

- リポジトリの `Actions` タブ → `Daily Trend Check` ワークフローを選択
- 「Run workflow」ボタンで手動実行し、Slackに通知が届くか確認

これで毎日 **JST 9:00** に自動実行され、Slackにトレンドレポートが届きます。

## カスタマイズ

- **実行時刻を変更したい場合**: `.github/workflows/daily-trend-check.yml` の `cron: "0 0 * * *"` を編集してください。cronはUTC基準なので、JSTの時刻から9時間引いた値を指定します（例: JST 8:00 → `cron: "0 23 * * *"` ※前日UTC 23:00）。
- **調査内容を変更したい場合**: `scripts/daily-trend-check.js` 内の `PROMPT` 変数を編集してください。
- **Slack以外に送りたい場合**: `postToSlack` 関数部分を、メール送信（例: SendGrid API）やDiscord Webhookなどに差し替えれば同じ構成で流用できます。

## 費用について

- **GitHub Actions**: パブリックリポジトリは無料。プライベートリポジトリも無料枠（月2,000分）内で収まる想定です（本ジョブは数分程度）。
- **Claude API**: モデルのトークン利用料に加えて、Web検索は1,000回あたり$10の従量課金です（1日1回・十数クエリ程度なら月額は小さい想定ですが、正確な料金は https://docs.claude.com のPricingページでご確認ください）。
