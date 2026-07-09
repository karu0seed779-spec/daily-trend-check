// scripts/daily-trend-check.js
//
// 毎日GitHub Actionsから実行される想定のスクリプト。
// Claude API（web検索ツール付き）にトレンド調査をさせ、結果をSlackに通知する。
//
// 必要な環境変数（GitHub Secretsで設定）:
//   ANTHROPIC_API_KEY  - Anthropic APIキー
//   SLACK_WEBHOOK_URL  - Slack Incoming Webhook URL
//
// Node.js 20+ 前提（グローバルfetchを使用）

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

if (!ANTHROPIC_API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY が設定されていません");
  process.exit(1);
}
if (!SLACK_WEBHOOK_URL) {
  console.error("ERROR: SLACK_WEBHOOK_URL が設定されていません");
  process.exit(1);
}

const today = new Date().toLocaleDateString("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const PROMPT = `本日（${today}）時点で話題になっている以下の情報を、Web検索で確認したうえで、シンプルな箇条書きのみで回答してください。説明文は不要です。

*YouTube*
・急上昇中のキーワード（上位5つ）

*TikTok*
・トレンドハッシュタグ（上位5つ）

*X（旧Twitter）*
・トレンドキーワード（上位5つ、日本国内）

*GitHub Trending*
・注目リポジトリ名（上位5つ）

出力は各カテゴリ5行以内、単語のみ。前置き・まとめ・解説は一切書かないこと。`;

### 注意事項
- 必ずWeb検索で裏取りしてから記載する。推測で書かない。
- 確認できなかった項目は「確認できず」と明記する。
- 全体を通して簡潔に。Slackで読みやすい長さを意識する。`;

async function callClaude() {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 800,
      messages: [{ role: "user", content: PROMPT }],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 6,
          user_location: {
            type: "approximate",
            country: "JP",
            timezone: "Asia/Tokyo",
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errText}`);
  }

  const data = await response.json();

  // content配列にはtext, server_tool_use, web_search_tool_result等が混在するので、
  // テキストブロックだけを連結する
  const text = data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  if (!text) {
    throw new Error("Claudeからテキスト応答が得られませんでした: " + JSON.stringify(data));
  }

  return text;
}

// Slackの1メッセージあたりの文字数制限に配慮し、必要なら分割して投稿する
async function postToSlack(text) {
  const CHUNK_SIZE = 3500;
  const header = `:bar_chart: *本日のトレンドレポート（${today}）*\n\n`;
  const full = header + text;

  const chunks = [];
  for (let i = 0; i < full.length; i += CHUNK_SIZE) {
    chunks.push(full.slice(i, i + CHUNK_SIZE));
  }

  for (const chunk of chunks) {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: chunk }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Slack Webhook error: ${res.status} ${errText}`);
    }
  }
}

async function main() {
  console.log("トレンド調査を開始します...");
  const report = await callClaude();
  console.log("調査完了。Slackに投稿します...");
  await postToSlack(report);
  console.log("完了しました。");
}

main().catch((err) => {
  console.error("実行に失敗しました:", err);
  process.exit(1);
});
