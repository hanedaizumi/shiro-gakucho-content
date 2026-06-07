import type { CollectedData } from "@/lib/collectors";
import type { Candle } from "@/lib/types";
import { calculateRSI } from "./indicators";

export type MarketPhase =
  | "crash_bottom"
  | "range"
  | "strong_trend_bull"
  | "strong_trend_bear"
  | "reversal";

export interface PhaseDetectionResult {
  phase: MarketPhase;
  label: string;
  reasons: string[];
  scores: Record<MarketPhase, number>;
  eventOverlay: string | null;
  rsiDivergenceHint: "bullish" | "bearish" | "none";
}

const PANIC_KEYWORDS = [
  "liquidation", "清算", "ロスカット", "暴落", "crash", "selloff",
  "capitulation", "パニック", "底", "oversold",
];

function countPanicSignals(data: CollectedData): number {
  let count = 0;
  const texts = [
    ...data.news.map((n) => `${n.title} ${n.summary}`),
    ...data.youtubeAnalysis.map((v) => `${v.title} ${v.excerpt} ${v.summary}`),
  ];
  for (const text of texts) {
    const lower = text.toLowerCase();
    if (PANIC_KEYWORDS.some((k) => lower.includes(k.toLowerCase()))) count++;
  }
  return count;
}

function detectRsiDivergenceHint(daily: Candle[]): "bullish" | "bearish" | "none" {
  if (daily.length < 20) return "none";
  const slice = daily.slice(-30);
  const lows: { idx: number; price: number; rsi: number }[] = [];

  for (let i = 2; i < slice.length - 2; i++) {
    const c = slice[i];
    if (c.low < slice[i - 1].low && c.low < slice[i - 2].low && c.low <= slice[i + 1].low) {
      const rsi = calculateRSI(slice.slice(0, i + 1)) ?? 50;
      lows.push({ idx: i, price: c.low, rsi });
    }
  }

  if (lows.length < 2) return "none";
  const a = lows[lows.length - 2];
  const b = lows[lows.length - 1];
  if (b.price < a.price && b.rsi > a.rsi + 2) return "bullish";
  if (b.price > a.price && b.rsi < a.rsi - 2) return "bearish";
  return "none";
}

export interface PhaseInput {
  trend: "bullish" | "bearish" | "neutral";
  change7d: number;
  ma200Divergence: number;
  rsiDaily: number;
  volumeSpike: boolean;
  candleCharacteristics: string;
  daily: Candle[];
}

export function detectMarketPhase(
  input: PhaseInput,
  data: CollectedData
): PhaseDetectionResult {
  const scores: Record<MarketPhase, number> = {
    crash_bottom: 0,
    range: 0,
    strong_trend_bull: 0,
    strong_trend_bear: 0,
    reversal: 0,
  };

  const panicCount = countPanicSignals(data);
  const divHint = detectRsiDivergenceHint(input.daily);

  if (input.ma200Divergence <= -15) scores.crash_bottom += 35;
  if (input.ma200Divergence <= -10) scores.crash_bottom += 15;
  if (input.rsiDaily < 25) scores.crash_bottom += 30;
  if (input.rsiDaily < 35) scores.crash_bottom += 10;
  if (input.change7d < -10) scores.crash_bottom += 25;
  if (input.change7d < -5 && input.trend === "bearish") scores.crash_bottom += 15;
  if (input.volumeSpike) scores.crash_bottom += 15;
  if (panicCount >= 2) scores.crash_bottom += 20;
  if (panicCount >= 1) scores.crash_bottom += 10;

  if (Math.abs(input.change7d) <= 5 && input.trend === "neutral") scores.range += 40;
  if (Math.abs(input.change7d) <= 3) scores.range += 20;
  if (Math.abs(input.ma200Divergence) <= 8) scores.range += 15;
  if (input.rsiDaily >= 40 && input.rsiDaily <= 60) scores.range += 10;

  if (input.trend === "bullish" && input.change7d > 8) scores.strong_trend_bull += 40;
  if (input.trend === "bullish" && input.change7d > 5) scores.strong_trend_bull += 20;
  if (input.trend === "bullish") scores.strong_trend_bull += 15;

  if (input.trend === "bearish" && input.change7d < -8) scores.strong_trend_bear += 40;
  if (input.trend === "bearish" && input.change7d < -5) scores.strong_trend_bear += 20;
  if (input.trend === "bearish" && input.ma200Divergence > -10) scores.strong_trend_bear += 15;

  if (divHint === "bullish" && input.trend === "bearish") scores.reversal += 35;
  if (input.candleCharacteristics.includes("下ヒゲ")) scores.reversal += 20;
  if (input.rsiDaily < 30 && input.change7d > -3) scores.reversal += 15;
  if (panicCount >= 1 && input.volumeSpike) scores.reversal += 10;

  if (scores.crash_bottom >= 50 && scores.crash_bottom >= scores.reversal) {
    scores.reversal = Math.max(0, scores.reversal - 10);
  }

  const sorted = (Object.entries(scores) as [MarketPhase, number][])
    .sort((a, b) => b[1] - a[1]);
  const phase = sorted[0][1] > 0 ? sorted[0][0] : "range";

  const labels: Record<MarketPhase, string> = {
    crash_bottom: "暴落・底値圏",
    range: "レンジ相場・保ち合い",
    strong_trend_bull: "強い上昇トレンド",
    strong_trend_bear: "強い下落トレンド",
    reversal: "トレンド転換の兆し",
  };

  const reasons: string[] = [];
  if (phase === "crash_bottom") {
    if (input.ma200Divergence <= -15) reasons.push(`200日MA乖離率${input.ma200Divergence.toFixed(1)}%で歴史的な割安水準`);
    if (input.rsiDaily < 25) reasons.push(`RSI(日足)${input.rsiDaily.toFixed(1)}で売られすぎゾーン`);
    if (input.change7d < -10) reasons.push(`7日間で${input.change7d.toFixed(1)}%の急落`);
    if (input.volumeSpike) reasons.push("出来高が平均の1.8倍超え＝大口の投げ売り");
    if (panicCount > 0) reasons.push(`ニュース/動画で清算・暴落キーワードが${panicCount}件`);
  } else if (phase === "range") {
    reasons.push(`7日変化${input.change7d >= 0 ? "+" : ""}${input.change7d.toFixed(1)}%で方向感が限定`);
    reasons.push("高値・安値の更新が止まり、レンジ内で推移");
  } else if (phase === "strong_trend_bull") {
    reasons.push("ダウ理論で高値・安値の切り上がりが継続");
    if (input.change7d > 5) reasons.push(`7日間で+${input.change7d.toFixed(1)}%の上昇`);
  } else if (phase === "strong_trend_bear") {
    reasons.push("ダウ理論で高値・安値の切り下がりが継続");
    if (input.change7d < -5) reasons.push(`7日間で${input.change7d.toFixed(1)}%の下落`);
  } else if (phase === "reversal") {
    if (divHint === "bullish") reasons.push("価格は安値更新中だがRSIは切り上がり＝強気ダイバージェンスの兆候");
    if (input.candleCharacteristics.includes("下ヒゲ")) reasons.push("下ヒゲ連続で下値に買い支え");
    if (panicCount > 0) reasons.push("パニック売り後の反発局面を警戒");
  }

  if (!reasons.length) reasons.push(labels[phase]);

  let eventOverlay: string | null = null;
  if (panicCount >= 1 && (phase === "crash_bottom" || phase === "reversal")) {
    eventOverlay =
      "ニュース・分析動画で清算（ロスカット）の言及があり、セリング・クライマックス（パニック売りのピーク）の構造が疑われます";
  }

  return {
    phase,
    label: labels[phase],
    reasons,
    scores,
    eventOverlay,
    rsiDivergenceHint: divHint,
  };
}
