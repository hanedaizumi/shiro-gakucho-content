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
      definition: technical.conceptSuggestion.definition,
      chartApplication: technical.conceptSuggestion.chartApplication,
      benefit: technical.conceptSuggestion.benefit,
      entryBridge: technical.conceptSuggestion.entryBridge,
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
  const t = json.technical;
  const b = json.scenarios.bullish as Record<string, unknown>;
  const s = json.scenarios.bearish as Record<string, unknown>;
  const ca = json.chartAnalysis as Record<string, unknown>;
  const levels = (ca.keyLevels as Array<{ price: number; type: string; reason: string }>) ?? [];
  const youtubeBlock = buildYouTubeContextBlock(json);
  const wc = json.weeklyConcept as Record<string, string>;

  const prevSection = buildPreviousPredictionReport(
    previousScript,
    t.currentPrice,
    String(ca.trend),
    String(ca.trendReversalCondition)
  );

  const biasLabel =
    t.tradingBias === "bullish" ? "上昇優先" :
    t.tradingBias === "bearish" ? "下落優先" : "中立";

  const trend4hLabel =
    t.trend4h === "bullish" ? "上昇" : t.trend4h === "bearish" ? "下落" : "レンジ";
  const trend1hLabel =
    t.trend1h === "bullish" ? "上昇" : t.trend1h === "bearish" ? "下落" : "レンジ";
  const trendDailyLabel =
    t.trend === "bullish" ? "上昇" : t.trend === "bearish" ? "下落" : "レンジ";

  const supportLevels = levels.filter((l) => l.type === "support").sort((a, b) => b.price - a.price).slice(0, 3);
  const resistanceLevels = levels.filter((l) => l.type === "resistance").sort((a, b) => a.price - b.price).slice(0, 3);

  const allLevelsTable = [
    ...resistanceLevels.map((l) => `| ${formatPrice(l.price)} | 抵抗（レジスタンス） | ${l.reason ?? ""} |`),
    `| **${formatPrice(t.currentPrice)}** | **← 現在値** |  |`,
    ...supportLevels.map((l) => `| ${formatPrice(l.price)} | 支持（サポート） | ${l.reason ?? ""} |`),
  ].join("\n");

  const mainScenario = t.tradingBias === "bearish" ? s : b;
  const subScenario = t.tradingBias === "bearish" ? b : s;
  const mainLabel = t.tradingBias === "bearish" ? "下落（メイン）" : "上昇（メイン）";
  const subLabel = t.tradingBias === "bearish" ? "上昇（サブ・警戒用）" : "下落（サブ・警戒用）";

  return `# BTCテクニカルレポート ${date}
> このレポートは台本④〜⑦セクションのインプット素材です。

---

## 【基本情報】
- **現在値**: ${formatPrice(t.currentPrice)}ドル
- **24h変化**: ${t.change24h >= 0 ? "+" : ""}${t.change24h.toFixed(2)}%
- **7d変化**: ${t.change7d >= 0 ? "+" : ""}${t.change7d.toFixed(2)}%
- **市場フェーズ**: ${(json.marketPhase as Record<string, string>)?.label ?? "未判定"}
- **ATR(14日足)**: ${formatPrice(t.atr14)}ドル（損切り・利確幅の基準値）
- **バイアス設定**: ${biasLabel}
${json.priceVolatility.dominance ? `- **BTCドミナンス**: ${(json.priceVolatility.dominance as number).toFixed(1)}%` : ""}

---

## 【前回予測との照合】
${prevSection}

---

## ④ BTCの現在地（日足ベース）

### 【指標】
**▼ 固定ベース指標（毎回確認）**
| 指標 | 数値 | 判定 |
|------|------|------|
| 現在値 | ${formatPrice(t.currentPrice)}ドル | — |
| MA200（日足） | ${formatPrice(t.ma200)}ドル | 乖離率 ${t.ma200Divergence >= 0 ? "+" : ""}${t.ma200Divergence.toFixed(1)}% |
| RSI（日足） | ${t.rsiDaily.toFixed(1)} | ${t.rsiDaily > 70 ? "買われすぎ警戒" : t.rsiDaily < 30 ? "売られすぎ（反発注視）" : t.rsiDaily > 55 ? "強め" : t.rsiDaily < 45 ? "弱め" : "中立"} |
| RSI（4H） | ${t.rsi4h.toFixed(1)} | ${t.rsi4h > 60 ? "短期過熱注意" : t.rsi4h < 40 ? "短期売られすぎ" : "中立"} |
| RSI（1H） | ${t.rsi1h.toFixed(1)} | ${t.rsi1h > 60 ? "1H過熱" : t.rsi1h < 40 ? "1H売られすぎ" : "中立"} |
| 7日変化 | ${t.change7d >= 0 ? "+" : ""}${t.change7d.toFixed(2)}% | — |

**▼ フェーズ別注目指標**
${t.phaseReasons.slice(0, 3).map((r) => `- ${r}`).join("\n")}

### 【ローソク足】
- **日足直近**: ${t.candleCharacteristics}
- **4H足**: ${t.candleCharacteristics4h}
- **1H足**: ${t.candleCharacteristics1h}
- **出来高**: ${t.volumeSpike ? "急増あり（平均比+80%以上）─ 大口の動きが入った可能性" : "通常水準（特筆なし）"}

### 【ライン（水平線・斜め線）】
**▼ 主要ライン（上から下）**
| 価格 | 種別 | 根拠 |
|------|------|------|
${allLevelsTable}

**▼ マルチタイムフレーム整合**
| 時間足 | トレンド | 判定 |
|--------|----------|------|
| 日足 | ${trendDailyLabel} | ベース方向 |
| 4時間足 | ${trend4hLabel} | エントリーゾーン |
| 1時間足 | ${trend1hLabel} | トリガー確認用 |

**▼ 総合判断**: 3本の時間足が${
    t.trend === t.trend4h && t.trend4h === t.trend1h
      ? "すべて同方向→方向感が明確"
      : t.trend === t.trend4h
      ? "日足・4Hが一致、1Hは揺れ→エントリー待ちの局面"
      : "時間足間で乖離→慎重にトリガー確認が必要"
  }

**▼ トレンド転換条件**
${t.trendReversalCondition}
${youtubeBlock}

---

## ⑤ 今週の重要ポイント：${wc.name}
> **選定理由**: ${wc.reason}

**1. 簡単に定義（10秒で「これは〜のことです」）**
${wc.definition ?? wc.reason}

**2. 今のBTCチャートでの具体的な見方・使い方**
${wc.chartApplication ?? `現在価格${formatPrice(t.currentPrice)}ドルで確認できる形状に注目します。`}

**3. これが分かると何が良いか？**
${wc.benefit ?? "エントリー根拠の精度が上がります。"}

**4. エントリー判断への繋ぎ**
${wc.entryBridge ?? t.trendReversalCondition}

---

## ⑦ シナリオ別アクションプラン

> **バイアス: ${biasLabel}** ｜ ATR(14): ${formatPrice(t.atr14)}ドル（損切り幅の基準）

### 【${mainLabel} シナリオ】
| 項目 | 内容 |
|------|------|
| トリガー | ${mainScenario.trigger} |
| エントリー | ${mainScenario.entry} |
| 損切り | ${mainScenario.stopLoss} |
| 利確① | ${mainScenario.takeProfit1} |
| 利確② | ${mainScenario.takeProfit2} |
| RR比 | ${mainScenario.rrRatio} |
| 注意 | ${mainScenario.notes} |

### 【${subLabel} シナリオ】
| 項目 | 内容 |
|------|------|
| トリガー | ${subScenario.trigger} |
| エントリー | ${subScenario.entry} |
| 損切り | ${subScenario.stopLoss} |
| 利確① | ${subScenario.takeProfit1} |
| 利確② | ${subScenario.takeProfit2} |
| RR比 | ${subScenario.rrRatio} |
| 注意 | ${subScenario.notes} |

---

## 【補足データ】
${json.externalSummary.news && (json.externalSummary.news as unknown[]).length > 0
  ? `### ファンダメンタルズ（参考ニュース）\n${(json.externalSummary.news as Array<{ title: string }>).slice(0, 5).map((n) => `- ${n.title}`).join("\n")}`
  : ""}
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
