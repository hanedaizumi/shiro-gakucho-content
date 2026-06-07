import { readFile } from "fs/promises";
import path from "path";
import type { CollectedData } from "@/lib/collectors";
import type { ReportJson, TechnicalAnalysis } from "@/lib/types";
import { formatPrice } from "@/lib/analysis";
import { callLlm } from "./provider";

async function loadPrompt(name: string): Promise<string> {
  const promptPath = path.join(process.cwd(), "..", "prompts", name);
  try {
    return await readFile(promptPath, "utf-8");
  } catch {
    return name.includes("report")
      ? "BTC市況レポートを日本語Markdownで作成してください。"
      : "YouTube台本を日本語で作成してください。";
  }
}

function buildReportJson(
  data: CollectedData,
  technical: TechnicalAnalysis,
  previousPrediction: Record<string, unknown>
): ReportJson {
  const sources = [
    {
      type: "binance",
      title: "Binance BTC/USDT",
      url: "https://api.binance.com",
      fetchedAt: data.binance.fetchedAt,
    },
    ...data.news.map((n) => ({
      type: "news",
      title: n.title,
      url: n.url,
      fetchedAt: n.publishedAt,
    })),
    ...data.youtube.map((v) => ({
      type: "youtube",
      title: v.title,
      url: v.url,
      fetchedAt: v.publishedAt,
    })),
    ...data.xPosts.map((p) => ({
      type: "x",
      title: p.text.slice(0, 80),
      url: p.url,
      fetchedAt: p.createdAt,
    })),
  ];

  if (data.cmc) {
    sources.push({
      type: "coinmarketcap",
      title: "CoinMarketCap BTC",
      url: "https://coinmarketcap.com",
      fetchedAt: new Date().toISOString(),
    });
  }

  return {
    summary: `BTCは${formatPrice(technical.currentPrice)}ドル付近。${technical.trend === "bearish" ? "下落トレンド継続" : technical.trend === "bullish" ? "上昇トレンド" : "レンジ"}と判断できます。`,
    priceVolatility: {
      currentPrice: technical.currentPrice,
      change24h: technical.change24h,
      change7d: technical.change7d,
      high24h: data.binance.ticker24h.high,
      low24h: data.binance.ticker24h.low,
      marketCap: data.cmc?.marketCap,
      dominance: data.cmc?.dominance,
    },
    chartAnalysis: {
      trend: technical.trend,
      reasons: technical.trendReasons,
      keyLevels: technical.keyLevels,
      ma200: technical.ma200,
      ma200Divergence: technical.ma200Divergence,
      rsiDaily: technical.rsiDaily,
      rsi4h: technical.rsi4h,
      candleCharacteristics: technical.candleCharacteristics,
      trendReversalCondition: technical.trendReversalCondition,
      volumeSpike: technical.volumeSpike,
    },
    weeklyConcept: {
      name: technical.conceptSuggestion.name,
      reason: technical.conceptSuggestion.reason,
      ma200: technical.ma200,
      divergence: technical.ma200Divergence,
      rsi: technical.rsiDaily,
    },
    scenarios: {
      bullish: technical.scenarios.bullish,
      bearish: technical.scenarios.bearish,
    },
    previousPrediction,
    externalSummary: {
      news: data.news.map((n) => ({ title: n.title, source: n.source })),
      youtube: data.youtube.map((v) => ({ title: v.title, channel: v.channelTitle })),
      x: data.xPosts.map((p) => ({ text: p.text.slice(0, 200), author: p.author })),
    },
    sources,
    technical,
  };
}

function buildReportMarkdown(json: ReportJson, date: string): string {
  const b = json.scenarios.bullish as Record<string, string>;
  const s = json.scenarios.bearish as Record<string, string>;
  const ca = json.chartAnalysis as Record<string, unknown>;
  const levels = (ca.keyLevels as Array<{ price: number; type: string; reason: string }>) ?? [];

  return `# BTC市況レポート ${date}

## 1. サマリー（現在地1文）
${json.summary}

## 2. 価格・ボラティリティ
- 現在値: ${formatPrice(json.technical.currentPrice)}ドル
- 24h変化: ${json.technical.change24h.toFixed(2)}%
- 7d変化: ${json.technical.change7d.toFixed(2)}%
${json.priceVolatility.marketCap ? `- 時価総額: $${(json.priceVolatility.marketCap as number).toLocaleString()}` : ""}

## 3. チャート形状分析（日足）
- トレンド: ${ca.trend}
${(ca.reasons as string[]).map((r) => `- ${r}`).join("\n")}
- MA200: ${formatPrice(json.technical.ma200)}ドル（乖離率 ${json.technical.ma200Divergence.toFixed(1)}%）
- RSI(日足): ${json.technical.rsiDaily.toFixed(1)}
- ローソク足: ${ca.candleCharacteristics}
- 重要ライン:
${levels.map((l) => `  - ${formatPrice(l.price)}ドル（${l.type}）: ${l.reason}`).join("\n")}
- トレンド転換条件: ${ca.trendReversalCondition}

## 4. 今週注目のテクニカル概念
**${(json.weeklyConcept as Record<string, string>).name}**
${(json.weeklyConcept as Record<string, string>).reason}

## 5. シナリオ別アクションプラン
### 上昇シナリオ
- トリガー: ${b.trigger}
- エントリー: ${b.entry}
- 損切り: ${b.stopLoss}
- 利確1: ${b.takeProfit1}
- 利確2: ${b.takeProfit2}

### 下落シナリオ
- トリガー: ${s.trigger}
- エントリー: ${s.entry}
- 損切り: ${s.stopLoss}
- 利確1: ${s.takeProfit1}
- 利確2: ${s.takeProfit2}

## 6. 前回予測との照合
${JSON.stringify(json.previousPrediction, null, 2)}

## 7. 外部情報サマリー
### ニュース
${(json.externalSummary.news as Array<{ title: string }>).map((n) => `- ${n.title}`).join("\n") || "- 該当なし"}

### YouTube
${(json.externalSummary.youtube as Array<{ title: string; channel: string }>).map((v) => `- [${v.channel}] ${v.title}`).join("\n") || "- APIキー未設定または該当なし"}

### X
${(json.externalSummary.x as Array<{ text: string }>).map((p) => `- ${p.text}`).join("\n") || "- 手動入力またはAPI未取得"}

## 8. 出典一覧
${json.sources.map((s) => `- [${s.type}] ${s.title} (${s.fetchedAt})${s.url ? ` ${s.url}` : ""}`).join("\n")}
`;
}

export async function generateReport(
  data: CollectedData,
  technical: TechnicalAnalysis,
  previousPrediction: Record<string, unknown>
): Promise<{ markdown: string; json: ReportJson }> {
  const json = buildReportJson(data, technical, previousPrediction);
  const date = new Date().toISOString().split("T")[0];
  const ruleBasedMd = buildReportMarkdown(json, date);

  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return { markdown: ruleBasedMd, json };
  }

  try {
    const system = await loadPrompt("report-system.md");
    const user = `以下のJSONを元にレポートを作成してください。\n\n${JSON.stringify(json, null, 2)}`;
    const llmMd = await callLlm(system, user);
    return { markdown: llmMd || ruleBasedMd, json };
  } catch {
    return { markdown: ruleBasedMd, json };
  }
}
