import { readFile } from "fs/promises";
import path from "path";
import type { CollectedData } from "@/lib/collectors";
import type { ReportJson, TechnicalAnalysis } from "@/lib/types";
import { formatPrice } from "@/lib/analysis";
import {
  buildPreviousPredictionReport,
  type PreviousScriptContext,
} from "@/lib/external-refs/previous-script";
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

function buildYouTubeContextBlock(json: ReportJson): string {
  const consensus = json.externalSummary.youtubeConsensus as {
    overallSentiment?: string;
    watchedCount?: number;
    totalCount?: number;
    commonPrices?: number[];
  } | undefined;
  const videos = (json.externalSummary.youtube as Array<{
    channel: string;
    title: string;
    fromWatchedChannel?: boolean;
    sentiment?: string;
    summary?: string;
    mentionedPrices?: number[];
    keyPoints?: string[];
  }>) ?? [];

  if (!videos.length) return "";

  const header = consensus
    ? `**参考動画の市場見立て:** ${consensus.overallSentiment}（ウォッチ${consensus.watchedCount ?? 0}本 / 計${consensus.totalCount ?? 0}本）`
    : "**参考動画の市場見立て:**";
  const priceLine = consensus?.commonPrices?.length
    ? `\n複数動画で言及された価格: ${consensus.commonPrices.map((p) => `${p.toLocaleString()}ドル`).join("、")}`
    : "";

  const lines = videos.slice(0, 3).map((v) => {
    const tag = v.fromWatchedChannel ? "[ウォッチ]" : "";
    const points = v.keyPoints?.slice(0, 2).join(" / ") ?? v.summary ?? "";
    return `- ${tag}[${v.channel}] ${v.title}（${v.sentiment ?? "中立"}）: ${points}`;
  });

  return `\n${header}${priceLine}\n${lines.join("\n")}`;
}

function buildReportJson(
  data: CollectedData,
  technical: TechnicalAnalysis,
  previousScript: PreviousScriptContext | null
): ReportJson {
  const previousPrediction = previousScript
    ? {
        scriptNumber: previousScript.scriptNumber,
        filename: previousScript.filename,
        predictionQuote: previousScript.predictionQuote,
        keyLevels: previousScript.keyLevels,
        conceptUsed: previousScript.conceptUsed,
        source: `02_アーカイブ/過去台本/${previousScript.filename}`,
      }
    : { summary: "前回台本なし" };

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
      cmcChange24h: data.cmc?.change24h,
      cmcRank: data.cmc?.rank,
    },
    marketContext: data.cmc
      ? {
          source: "CoinMarketCap",
          marketCap: data.cmc.marketCap,
          dominance: data.cmc.dominance,
          change24h: data.cmc.change24h,
          rank: data.cmc.rank,
          note: `BTC時価総額${(data.cmc.marketCap / 1e12).toFixed(2)}兆ドル、ドミナンス${data.cmc.dominance.toFixed(1)}%`,
        }
      : null,
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
    marketPhase: {
      phase: technical.marketPhase,
      label: technical.marketPhaseLabel,
      reasons: technical.phaseReasons,
    },
    confluence: technical.confluence,
    weeklyConcept: {
      name: technical.conceptSuggestion.name,
      reason: technical.conceptSuggestion.reason,
      phase: technical.conceptSuggestion.phase,
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
      youtube: data.youtubeAnalysis.map((a) => ({
        title: a.title,
        channel: a.channel,
        url: a.url,
        publishedAt: a.publishedAt,
        fromWatchedChannel: a.fromWatchedChannel,
        contentSource: a.contentSource,
        sentiment: a.sentiment,
        mentionedPrices: a.mentionedPrices,
        keyPoints: a.keyPoints,
        summary: a.summary,
        excerpt: a.excerpt,
      })),
      youtubeConsensus: data.youtubeConsensus,
    },
    sources: [],
    technical,
  };
}

function buildReportMarkdown(
  json: ReportJson,
  date: string,
  previousScript: PreviousScriptContext | null
): string {
  const b = json.scenarios.bullish as Record<string, string>;
  const s = json.scenarios.bearish as Record<string, string>;
  const ca = json.chartAnalysis as Record<string, unknown>;
  const levels = (ca.keyLevels as Array<{ price: number; type: string; reason: string }>) ?? [];
  const youtubeBlock = buildYouTubeContextBlock(json);

  const phaseReasons = ((json.marketPhase as { reasons?: string[] })?.reasons ?? []).slice(0, 2);

  const prevSection = buildPreviousPredictionReport(
    previousScript,
    json.technical.currentPrice,
    String(ca.trend),
    String(ca.trendReversalCondition)
  );

  return `# BTC市況レポート ${date}

## 1. サマリー（現在地1文）
${json.summary}

## 2. 価格・ボラティリティ
- 現在値: ${formatPrice(json.technical.currentPrice)}ドル
- 24h変化: ${json.technical.change24h.toFixed(2)}%
- 7d変化: ${json.technical.change7d.toFixed(2)}%
${json.priceVolatility.marketCap ? `- 時価総額: $${(json.priceVolatility.marketCap as number).toLocaleString()}` : ""}
${json.priceVolatility.dominance ? `- BTCドミナンス: ${(json.priceVolatility.dominance as number).toFixed(1)}%` : ""}

## 3. チャート形状分析（日足）
- フェーズ: ${(json.marketPhase as Record<string, string>)?.label ?? "未判定"}
- トレンド: ${ca.trend}
${phaseReasons.map((r) => `- ${r}`).join("\n")}
- 重要ライン:
${levels.slice(0, 4).map((l) => `  - ${formatPrice(l.price)}ドル（${l.type}）`).join("\n")}
- ローソク足: ${ca.candleCharacteristics}
- トレンド転換条件: ${ca.trendReversalCondition}
${youtubeBlock}

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

## 6. 前回予測との照合（自チャンネル・1つ前の台本）
${prevSection}
`;
}

export async function generateReport(
  data: CollectedData,
  technical: TechnicalAnalysis,
  previousScript: PreviousScriptContext | null
): Promise<{ markdown: string; json: ReportJson }> {
  const json = buildReportJson(data, technical, previousScript);
  const date = new Date().toISOString().split("T")[0];
  const ruleBasedMd = buildReportMarkdown(json, date, previousScript);

  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return { markdown: ruleBasedMd, json };
  }

  try {
    const system = await loadPrompt("report-system.md");
    const user = `以下のJSONを元にレポートを作成してください。§7・§8は出力不要。§6は自チャンネルの前回台本との照合のみ。\n\n${JSON.stringify(json, null, 2)}`;
    const llmMd = await callLlm(system, user);
    return { markdown: llmMd || ruleBasedMd, json };
  } catch {
    return { markdown: ruleBasedMd, json };
  }
}
