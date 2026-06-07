import type { CoinCollectedData } from "@/lib/collectors/coin-data";
import type { YouTubeCollectDiagnostics } from "@/lib/collectors/youtube";
import type { TechnicalAnalysis } from "@/lib/types";
import { formatPrice } from "@/lib/analysis";
import type { YouTubeVideoAnalysis } from "@/lib/collectors/youtube-analyzer";
import {
  buildPlanningAxisMemo,
  extractNumericHighlights,
  extractPlanningKeywords,
  formatCount,
  type PlanningContext,
} from "@/lib/planning/context";
import {
  NEWS_OUTPUT_LIMIT,
  selectTopNews,
  YOUTUBE_COLLECT_LIMIT,
  YOUTUBE_OUTPUT_DOMESTIC,
  YOUTUBE_OUTPUT_INTERNATIONAL,
} from "@/lib/planning/selection";

const RANK_LABELS = ["🥇", "🥈", "🥉", "4位", "5位"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function ageLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 30) return `（${days}日前・1ヶ月以内）`;
  if (days <= 90) return `（${days}日前・3ヶ月以内）`;
  return `（${days}日前）`;
}

function buildPlanningHeader(
  coin: CoinCollectedData["coin"],
  planning: PlanningContext
): string[] {
  const date = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const dateShort = new Date().toISOString().split("T")[0].replace(/-/g, "/");

  const lines = [
    `# ${coin.name}（${coin.symbol}）ニュース・時事リサーチ`,
    "",
    "**対象企画**",
  ];

  if (planning.thumbnailText) {
    lines.push(`- サムネ：${planning.thumbnailText}`);
  } else {
    lines.push("- サムネ：（未入力）");
  }
  if (planning.titleText) {
    lines.push(`- タイトル：${planning.titleText}`);
  } else {
    lines.push("- タイトル：（未入力）");
  }

  lines.push(
    "",
    `**リサーチ実施日：${date}**`,
    "",
    "---",
    "",
    `## 【${dateShort} 追加｜${coin.name}（${coin.symbol}）リサーチ】`,
    "",
    "### 企画メモ（台本の軸）"
  );

  for (const memo of buildPlanningAxisMemo(planning, coin.name, coin.symbol)) {
    lines.push(`- ${memo}`);
  }

  lines.push("", "---", "");
  return lines;
}

function buildNewsSection(
  data: CoinCollectedData,
  planning: PlanningContext
): string {
  if (!data.news.length) {
    return `該当期間（3ヶ月以内）で企画に関連するニュースは見つかりませんでした。
サムネ・タイトルのキーワードを調整するか、手動でニュースを追加してください。`;
  }

  const topNews = selectTopNews(
    data.news,
    planning,
    data.coin.keywords,
    NEWS_OUTPUT_LIMIT
  );

  const header = `### 台本採用ニュース TOP${NEWS_OUTPUT_LIMIT}（全${data.news.length}件収集 → サムネ・タイトル・検索ワードで精査）

採用基準：企画キーワード一致度（×3）＋コイン関連度＋新しさ`;

  const blocks = topNews.map((ranked, i) => {
    const { item, rankScore, planningScore } = ranked;
    const body = `${item.title} ${item.summary}`;
    const highlights = extractNumericHighlights(body);
    const label = RANK_LABELS[i] ?? `${i + 1}位`;
    const hookIdea =
      planningScore > 0
        ? `企画キーワードと一致（企画スコア${planningScore}）。サムネ・タイトルのフック回収に最適`
        : "コイン関連ニュースとして根拠素材に使える。企画との接続を手動で補強推奨";

    return `#### ${label} ランキング${i + 1}位｜総合スコア：${rankScore}
**${item.title}**
- 日付：${formatDate(item.publishedAt)}${ageLabel(item.publishedAt)}
- ソース：${item.source}
- 内容：${item.summary || item.title}
- 数値ハイライト：
${highlights.length ? highlights.map((h) => `  - ${h}`).join("\n") : "  - （RSS要約から数値抽出なし。原文URLで確認推奨）"}
- URL：${item.url || "なし"}
- 台本活用メモ：${hookIdea}`;
  });

  return `${header}\n\n${blocks.join("\n\n---\n\n")}`;
}

function buildYouTubeEmptyMessage(
  diagnostics: YouTubeCollectDiagnostics | null
): string {
  if (diagnostics?.quotaExceeded) {
    const fallbackNote = diagnostics.fallbackApiKeyUsed
      ? "- 予備キー（YOUTUBE_API_KEY_FALLBACK）への自動切替は試みましたが、こちらも上限に達しています"
      : diagnostics.apiKeyCount > 1
        ? "- 予備キーへの自動切替はまだ発生していません（メインキー以外は未使用）"
        : "- 予備キー（YOUTUBE_API_KEY_FALLBACK）が未設定です";

    return `拡散率2倍以上の競合動画は取得できませんでした。

**判明した原因：YouTube API の検索クォータ超過（HTTP 429）**
- 無料枠の検索上限は **1日100回/プロジェクト** です（search.list）
- 登録キー数：${diagnostics.apiKeyCount}個（メイン優先 → 超過時にフォールバック自動切替）
${fallbackNote}
- 動画が存在しないわけではありません

**対応案：**
- **翌日（太平洋時間0時以降）** に再実行する（メインキーの枠がリセットされます）
- [Google Cloud Console](https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas) でクォータ増加を申請する
- 同じコインを再検索する場合、24時間キャッシュが効きます（検索回数を節約）

**診断情報：**
- API検索呼び出し：${diagnostics.searchCalls}回
- キャッシュ利用：${diagnostics.searchCacheHits}回
- フォールバックキー使用：${diagnostics.fallbackApiKeyUsed ? "あり" : "なし"}
- 候補動画ID：${diagnostics.candidateIds}件 → 関連フィルタ後：${diagnostics.afterRelevanceFilter}件 → 拡散率2倍通過：${diagnostics.afterSpreadFilter}件`;
  }

  if (
    diagnostics?.searchErrors.some((e) =>
      e.message.includes("YOUTUBE_API_KEY")
    )
  ) {
    return `拡散率2倍以上の競合動画は取得できませんでした。

**判明した原因：YouTube APIキー未設定**
- \`app/.env\` に \`YOUTUBE_API_KEY\` を設定してください`;
  }

  if (diagnostics && diagnostics.candidateIds > 0 && diagnostics.afterSpreadFilter === 0) {
    return `拡散率2倍以上の競合動画は見つかりませんでした。

**判明した原因：候補は${diagnostics.candidateIds}件取得できましたが、拡散率2倍未満で全件除外されました**
- 登録者数非公開チャンネルも除外対象です
- 海外の大規模チャンネルは再生数が多くても拡散率が2倍に届かないことがあります

**対応案：**
- 検索クエリ・企画キーワードを調整して再検索
- 設定画面でウォッチチャンネルを追加（チャンネル直取得は検索クォータを消費しません）`;
  }

  if (diagnostics && diagnostics.candidateIds === 0) {
    return `拡散率2倍以上の競合動画は取得できませんでした。

**判明した原因：YouTube検索で候補動画IDが0件**
${diagnostics.searchErrors.length ? `- APIエラー：${diagnostics.searchErrors.map((e) => `${e.status} ${e.message}`).join(" / ")}` : "- APIキー・ネットワーク・クォータを確認してください"}

**対応案：**
- 翌日に再実行（検索クォータは1日100回まで）
- APIキーが有効か Google Cloud Console で確認`;
  }

  return `拡散率2倍以上の競合動画は見つかりませんでした。

**考えられる原因：**
- YouTube APIの検索クォータ超過（1日100回上限）
- 直近6ヶ月以内に拡散率2倍以上の該当動画がない
- 企画キーワードがニッチすぎる

**対応案：**
- 翌日に再実行する
- サムネ・タイトルのキーワードを調整して再検索`;
}

function buildCompetitorReport(
  coin: CoinCollectedData["coin"],
  planning: PlanningContext,
  analyses: YouTubeVideoAnalysis[],
  diagnostics: YouTubeCollectDiagnostics | null
): string {
  const date = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const dateShort = new Date().toISOString().split("T")[0].replace(/-/g, "/");

  const header = [
    `# ${coin.name}（${coin.symbol}）競合台本リサーチ`,
    "",
    "**対象企画**",
    planning.thumbnailText ? `- サムネ：${planning.thumbnailText}` : "- サムネ：（未入力）",
    planning.titleText ? `- タイトル：${planning.titleText}` : "- タイトル：（未入力）",
    "",
    `**リサーチ実施日：${date}**`,
    "",
    "---",
    "",
    `## 【${dateShort} 追加｜${coin.name}（${coin.symbol}）競合リサーチ】`,
    "",
    "### 採用基準メモ",
    `- 最大${YOUTUBE_COLLECT_LIMIT}件収集 → **国内${YOUTUBE_OUTPUT_DOMESTIC}件＋海外${YOUTUBE_OUTPUT_INTERNATIONAL}件**に精査`,
    "- 主題コイン動画の**拡散率2倍以上**のみ候補（登録者数の2倍以上再生）",
    "- 対象期間：**直近6ヶ月以内**",
    "- 企画（サムネ・タイトル）とのテーマ一致度で最終選定",
    "",
    "---",
    "",
    `### 台本採用競合 TOP${YOUTUBE_OUTPUT_DOMESTIC + YOUTUBE_OUTPUT_INTERNATIONAL}（国内${YOUTUBE_OUTPUT_DOMESTIC}＋海外${YOUTUBE_OUTPUT_INTERNATIONAL}）`,
    "",
  ];

  if (!analyses.length) {
    return header.join("\n") + buildYouTubeEmptyMessage(diagnostics);
  }

  const domestic = analyses.filter((a) => !a.isInternational);
  const intl = analyses.filter((a) => a.isInternational);

  const blocks: string[] = [];

  if (domestic.length) {
    blocks.push("**【国内動画】**");
    blocks.push(
      ...domestic.map((v, i) => formatCompetitorBlock(v, i, "国内"))
    );
  }
  if (intl.length) {
    if (domestic.length) blocks.push("", "---", "");
    blocks.push("**【海外動画】**");
    blocks.push(...intl.map((v, i) => formatCompetitorBlock(v, i, "海外")));
  }

  return header.join("\n") + blocks.join("\n\n");
}

function formatCompetitorBlock(
  v: YouTubeVideoAnalysis,
  indexInRegion: number,
  region: "国内" | "海外"
): string {
  const views = v.viewCount ? formatCount(v.viewCount) : "不明";
  const subs = v.subscriberCount ? formatCount(v.subscriberCount) : "不明";
  const spread = v.spreadRate ? v.spreadRate.toFixed(2) : "不明";

  return `★${region}${indexInRegion + 1}つ目
**${v.title}**
${v.url}
チャンネル：${v.channel} ／ 区分：${region} ／ 登録者数：${subs}人 ／ 再生数：${views}回 ／ 拡散率：約${spread}倍

**フック分析：**
${v.hookAnalysis ?? v.summary}

**構成分析：**
${(v.structureAnalysis ?? v.keyPoints ?? []).map((p) => `- ${p}`).join("\n") || "- （字幕/概要欄から抽出）"}

**差別化メモ：**
${(v.differentiationMemo ?? []).map((m) => `- ${m}`).join("\n")}`;
}

function buildTechnicalSection(
  coin: CoinCollectedData["coin"],
  technical: TechnicalAnalysis
): string {
  const t = technical;
  const levels = t.keyLevels.slice(0, 4).map(
    (l) => `- ${l.type === "support" ? "サポート" : "レジスタンス"} ${formatPrice(l.price)}ドル（${l.reason}）`
  );

  return `---

# テクニカル分析（日足）

**対象：** ${coin.name}（${coin.symbol}）
**現在値：** ${formatPrice(t.currentPrice)}ドル
**24h：** ${t.change24h >= 0 ? "+" : ""}${t.change24h.toFixed(2)}% ／ **7d：** ${t.change7d >= 0 ? "+" : ""}${t.change7d.toFixed(2)}%

### 相場フェーズ
- ${t.marketPhaseLabel}
- トレンド：${t.trend === "bearish" ? "下落" : t.trend === "bullish" ? "上昇" : "レンジ"}

### 重要ライン
${levels.join("\n") || "- 該当ラインなし"}

### 今週の注目指標
- **${t.conceptSuggestion.name}**
- ${t.conceptSuggestion.reason}

### トレンド転換条件
${t.trendReversalCondition}

### シナリオ概要
**上昇：** ${t.scenarios.bullish.entry} → 利確 ${t.scenarios.bullish.takeProfit1}
**下落：** ${t.scenarios.bearish.entry} → 利確 ${t.scenarios.bearish.takeProfit1}`;
}

export function generateCoinReportMarkdown(
  data: CoinCollectedData,
  technical: TechnicalAnalysis | null,
  planning: PlanningContext
): string {
  const sections: string[] = [];

  if (data.mode === "fundamentals" || data.mode === "both") {
    sections.push(...buildPlanningHeader(data.coin, planning));
    sections.push(buildNewsSection(data, planning));

    sections.push(
      "",
      "---",
      "",
      buildCompetitorReport(
        data.coin,
        planning,
        data.youtubeAnalysis,
        data.youtubeDiagnostics
      )
    );
  }

  if ((data.mode === "technical" || data.mode === "both") && technical) {
    sections.push("", buildTechnicalSection(data.coin, technical));
  }

  return sections.join("\n");
}
