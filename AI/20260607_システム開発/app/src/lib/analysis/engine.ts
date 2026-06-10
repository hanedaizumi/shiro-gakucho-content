import type { CollectedData } from "@/lib/collectors";
import type { TechnicalAnalysis, TradeScenario, KeyLevel } from "@/lib/types";
import {
  calculateRSI,
  calculateSMA,
  calculateATR,
  calculateEMA,
  describeCandlePattern,
  formatPrice,
  roundPrice,
} from "./indicators";
import { deriveKeyLevels, detectTrend, findSwingPoints } from "./levels";
import { detectMarketPhase } from "./phase-detector";
import { buildConfluence } from "./confluence";
import { pickConceptByPhase } from "./phase-concepts";
import { buildConceptFourStep } from "./concept-library";
import type { TradingBias } from "@/lib/planning/context";

/** 簡易トレンド判定（短めの足向け） */
function quickTrend(
  candles: { close: number }[],
  maShort = 20,
  maLong = 50
): "bullish" | "bearish" | "neutral" {
  if (candles.length < maLong) return "neutral";
  const closes = candles.map((c) => c.close);
  const short = closes.slice(-maShort).reduce((a, b) => a + b, 0) / maShort;
  const long = closes.slice(-maLong).reduce((a, b) => a + b, 0) / maLong;
  const lastClose = closes[closes.length - 1];
  if (short > long * 1.005 && lastClose > short) return "bullish";
  if (short < long * 0.995 && lastClose < short) return "bearish";
  return "neutral";
}

/**
 * ATRベースの利確価格を計算する。
 * インジケーターの TP ロジックを踏襲：
 *   tp_step = ATR * 0.8 … ただしユーザー指定で最低 1,000 ドルの間隔を確保する
 */
function resolveTP(
  fromPrice: number,
  direction: "up" | "down",
  keyLevels: KeyLevel[],
  atr14: number
): number {
  const minStep = Math.max(atr14 * 0.8, 1000);
  const target = direction === "up" ? fromPrice + minStep : fromPrice - minStep;

  if (direction === "up") {
    const nextR = keyLevels
      .filter((l) => l.type === "resistance" && l.price >= target)
      .sort((a, b) => a.price - b.price)[0];
    return roundPrice(nextR?.price ?? target);
  } else {
    const nextS = keyLevels
      .filter((l) => l.type === "support" && l.price <= target)
      .sort((a, b) => b.price - a.price)[0];
    return roundPrice(nextS?.price ?? target);
  }
}

function buildScenarios(
  currentPrice: number,
  keyLevels: KeyLevel[],
  trend: "bullish" | "bearish" | "neutral",
  atr14: number,
  actionBridge: string
): { bullish: TradeScenario; bearish: TradeScenario } {
  const supports = keyLevels
    .filter((l) => l.type === "support" && l.price <= currentPrice)
    .sort((a, b) => b.price - a.price);
  const resistances = keyLevels
    .filter((l) => l.type === "resistance" && l.price >= currentPrice)
    .sort((a, b) => a.price - b.price);

  const nearestSupport = supports[0]?.price ?? roundPrice(currentPrice * 0.97);
  const nearestResistance = resistances[0]?.price ?? roundPrice(currentPrice * 1.05);

  // --- Long scenario (上昇) ---
  const entryLong = roundPrice(nearestSupport);
  const slLongPrice = roundPrice(entryLong - atr14 * 1.5);
  const slLongAmt = roundPrice(entryLong - slLongPrice);

  const tp1LongPrice = resolveTP(entryLong, "up", keyLevels, atr14);
  const tp1LongAmt = roundPrice(tp1LongPrice - entryLong);
  const tp2LongPrice = resolveTP(tp1LongPrice, "up", keyLevels, atr14);
  const tp2LongAmt = roundPrice(tp2LongPrice - entryLong);

  const rrLong = slLongAmt > 0 ? (tp1LongAmt / slLongAmt).toFixed(1) : "N/A";

  // --- Short scenario (下落) ---
  const entryShort = roundPrice(nearestResistance);
  const slShortPrice = roundPrice(entryShort + atr14 * 1.5);
  const slShortAmt = roundPrice(slShortPrice - entryShort);

  const tp1ShortPrice = resolveTP(entryShort, "down", keyLevels, atr14);
  const tp1ShortAmt = roundPrice(entryShort - tp1ShortPrice);
  const tp2ShortPrice = resolveTP(tp1ShortPrice, "down", keyLevels, atr14);
  const tp2ShortAmt = roundPrice(entryShort - tp2ShortPrice);

  const rrShort = slShortAmt > 0 ? (tp1ShortAmt / slShortAmt).toFixed(1) : "N/A";

  const bullish: TradeScenario = {
    trigger: `${formatPrice(entryLong)}ドル付近で4時間足陽線確定（下ヒゲ反発確認）`,
    entry: `${formatPrice(entryLong)}ドル付近でロング`,
    entryPrice: entryLong,
    stopLoss: `${formatPrice(slLongPrice)}ドル割れ（ATR×1.5 = ${formatPrice(slLongAmt)}ドル幅）`,
    stopLossPrice: slLongPrice,
    stopLossAmount: slLongAmt,
    takeProfit1: `${formatPrice(tp1LongPrice)}ドル（${formatPrice(tp1LongAmt)}ドル幅 = ATR×${(tp1LongAmt / atr14).toFixed(1)}倍）`,
    takeProfit1Price: tp1LongPrice,
    takeProfit1Amount: tp1LongAmt,
    takeProfit2: `${formatPrice(tp2LongPrice)}ドル（${formatPrice(tp2LongAmt)}ドル幅 = ATR×${(tp2LongAmt / atr14).toFixed(1)}倍）`,
    takeProfit2Price: tp2LongPrice,
    takeProfit2Amount: tp2LongAmt,
    rrRatio: `1:${rrLong}`,
    notes: actionBridge,
  };

  const bearish: TradeScenario = {
    trigger: `${formatPrice(entryShort)}ドル付近で4時間足上ヒゲ陰線確認後にショート`,
    entry: `${formatPrice(entryShort)}ドル付近でショート`,
    entryPrice: entryShort,
    stopLoss: `${formatPrice(slShortPrice)}ドル上抜け（ATR×1.5 = ${formatPrice(slShortAmt)}ドル幅）`,
    stopLossPrice: slShortPrice,
    stopLossAmount: slShortAmt,
    takeProfit1: `${formatPrice(tp1ShortPrice)}ドル（${formatPrice(tp1ShortAmt)}ドル幅 = ATR×${(tp1ShortAmt / atr14).toFixed(1)}倍）`,
    takeProfit1Price: tp1ShortPrice,
    takeProfit1Amount: tp1ShortAmt,
    takeProfit2: `${formatPrice(tp2ShortPrice)}ドル（${formatPrice(tp2ShortAmt)}ドル幅 = ATR×${(tp2ShortAmt / atr14).toFixed(1)}倍）`,
    takeProfit2Price: tp2ShortPrice,
    takeProfit2Amount: tp2ShortAmt,
    rrRatio: `1:${rrShort}`,
    notes: `基本目線は${trend === "bearish" ? "下" : trend === "bullish" ? "上" : "中立"}。高値切り下がりを確認してから入る。`,
  };

  return { bullish, bearish };
}

export function runTechnicalAnalysis(
  data: CollectedData,
  usedConcepts: string[] = [],
  tradingBias: TradingBias = "neutral"
): TechnicalAnalysis {
  const { daily, h4, h1 } = data.binance.candles;
  const currentPrice = data.binance.price;
  const closes = daily.map((c) => c.close);

  // --- 日足計算 ---
  const ma200 = calculateSMA(closes, 200) ?? closes[closes.length - 1];
  const ma200Divergence = ((currentPrice - ma200) / ma200) * 100;
  const rsiDaily = calculateRSI(daily) ?? 50;
  const ema20Daily = calculateEMA(daily, 20) ?? currentPrice;

  // --- 4H足計算 ---
  const rsi4h = calculateRSI(h4) ?? 50;
  const trend4h = quickTrend(h4);

  // --- 1H足計算 ---
  const rsi1h = h1?.length ? (calculateRSI(h1) ?? 50) : 50;
  const trend1h = h1?.length ? quickTrend(h1, 20, 50) : "neutral";

  // --- ATR計算（インジケーターと同ロジック: ta.atr(14)） ---
  const atr14 = calculateATR(daily, 14);

  const price7dAgo = daily[daily.length - 8]?.close ?? currentPrice;
  const change7d = ((currentPrice - price7dAgo) / price7dAgo) * 100;

  const { trend, reasons } = detectTrend(daily);
  const { highs, lows } = findSwingPoints(daily);
  const keyLevels = deriveKeyLevels(daily, currentPrice);

  const resistancesAbove = keyLevels.filter(
    (l) => l.type === "resistance" && l.price > currentPrice
  );
  const reversalLevel =
    resistancesAbove.sort((a, b) => a.price - b.price)[0]?.price ??
    roundPrice(currentPrice * 1.08);

  // --- ローソク足特徴 ---
  const last5 = daily.slice(-5);
  const upperWicks = last5.filter((c) => c.high - Math.max(c.open, c.close) > (c.high - c.low) * 0.4).length;
  const lowerWicks = last5.filter((c) => Math.min(c.open, c.close) - c.low > (c.high - c.low) * 0.4).length;

  let candleCharacteristics = "特筆すべきローソク足パターンは限定的";
  if (upperWicks >= 3) candleCharacteristics = "上ヒゲの長い陰線・陽線が連続し、上値抵抗が強い";
  if (lowerWicks >= 3) candleCharacteristics = "下ヒゲが連続し、下値で買い支えが入っている";

  const candleCharacteristics4h = h4.length >= 3 ? describeCandlePattern(h4, "4H") : "4H: データ不足";
  const candleCharacteristics1h = h1?.length >= 3 ? describeCandlePattern(h1, "1H") : "1H: データ不足";

  const recentVol = daily.slice(-5).map((c) => c.volume);
  const avgVol = daily.slice(-30).reduce((s, c) => s + c.volume, 0) / 30;
  const volumeSpike = recentVol.some((v) => v > avgVol * 1.8);

  const trendReversalCondition = `${formatPrice(reversalLevel)}ドルを日足実体で上抜けすること`;

  const phaseResult = detectMarketPhase(
    {
      trend,
      change7d,
      ma200Divergence,
      rsiDaily,
      volumeSpike,
      candleCharacteristics,
      daily,
    },
    data
  );

  const base = {
    currentPrice: roundPrice(currentPrice),
    change24h: data.binance.ticker24h.changePercent,
    change7d,
    trend,
    trendReasons: reasons,
    ma200: roundPrice(ma200),
    ma200Divergence,
    rsiDaily,
    rsi4h,
    rsi1h,
    atr14: roundPrice(atr14),
    trend4h,
    trend1h,
    tradingBias,
    swingHighs: highs,
    swingLows: lows,
    keyLevels,
    trendReversalCondition,
    candleCharacteristics,
    candleCharacteristics4h,
    candleCharacteristics1h,
    volumeSpike,
    _ema20Daily: ema20Daily,
  };

  const conceptPick = pickConceptByPhase(
    phaseResult.phase,
    base,
    usedConcepts,
    phaseResult.rsiDivergenceHint
  );

  const conceptFourStep = buildConceptFourStep(conceptPick.name, base as Parameters<typeof buildConceptFourStep>[1]);

  const confluence = buildConfluence(
    base,
    phaseResult,
    conceptPick.name,
    conceptPick.reason
  );

  const scenarios = buildScenarios(
    base.currentPrice,
    keyLevels,
    trend,
    atr14,
    confluence.actionBridge
  );

  return {
    ...base,
    marketPhase: phaseResult.phase,
    marketPhaseLabel: phaseResult.label,
    phaseReasons: phaseResult.reasons,
    confluence,
    scenarios,
    conceptSuggestion: {
      name: conceptPick.name,
      reason: conceptPick.reason,
      phase: phaseResult.phase,
      definition: conceptFourStep.definition,
      chartApplication: conceptFourStep.chartApplication,
      benefit: conceptFourStep.benefit,
      entryBridge: conceptFourStep.entryBridge,
    },
  };
}
