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

const PROMPT = `あなたはSNS・テックトレンドのリサーチャーです。本日（${today}）時点での最新トレンドを、Web検索を使って実際に調査したうえで、以下の4カテゴリについて日本語でランキング形式にまとめてください。

## 1. YouTubeトレンド
- YouTube「急上昇」タブの上位動画（総合・音楽・ゲームなど）
- Googleトレンド（YouTube検索）で急上昇中のキーワード

## 2. TikTokトレンド
- TikTok Creative CenterのTrend Discoveryで話題のハッシュタグ・楽曲・クリエイター（日本、直近7日間）

## 3. X（旧Twitter）トレンド
- Yahoo!リアルタイム検索での日本国内トレンドキーワード
- ついっトレンド（Twittrend）での全国トレンド

## 4. Changelog（テック・開発者向けトレンド）
- GitHub Trendingで今日・今週注目のリポジトリ
- Product Huntで本日の人気プロダクト・アップデート
- Zenn / Qiitaで話題の技術記事

### 出力フォーマット（Slack投稿を想定し、Markdownの強調記号「**」ではなくSlack記法を使うこと）
各カテゴリごとに、上位5件程度を以下の形式でまとめてください。

*[カテゴリ名]*
1. [トレンド名/タイトル] - 簡単な説明（1〜2文）
2. ...

最後に「本日の注目トピック」を3つ程度、簡潔にピックアップしてください。

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
      max_tokens: 4000,
      messages: [{ role: "user", content: PROMPT }],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 15,
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
