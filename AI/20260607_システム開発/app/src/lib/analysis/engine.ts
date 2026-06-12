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

/**
 * 損切り価格を計算する。
 * 台本の損切り感覚（エントリーラインの「すぐ外側」）に合わせ、
 * ラインから ATR×0.5 をバッファとして置く。最低300ドル・最大1,500ドル幅。
 */
function resolveSL(
  entryPrice: number,
  direction: "long" | "short",
  atr14: number
): { price: number; amount: number } {
  const buffer = Math.min(Math.max(atr14 * 0.5, 300), 1500);
  const price =
    direction === "long"
      ? roundPrice(entryPrice - buffer)
      : roundPrice(entryPrice + buffer);
  return { price, amount: Math.abs(roundPrice(entryPrice) - price) };
}

function buildScenario(params: {
  direction: "long" | "short";
  entryPrice: number;
  trigger: string;
  entryNote: string;
  keyLevels: KeyLevel[];
  atr14: number;
  notes: string;
}): TradeScenario {
  const { direction, trigger, entryNote, keyLevels, atr14, notes } = params;
  const entry = roundPrice(params.entryPrice);
  const tpDir = direction === "long" ? "up" : "down";

  const sl = resolveSL(entry, direction, atr14);

  const tp1Price = resolveTP(entry, tpDir, keyLevels, atr14);
  const tp1Amt = Math.abs(tp1Price - entry);
  const tp2Price = resolveTP(tp1Price, tpDir, keyLevels, atr14);
  const tp2Amt = Math.abs(tp2Price - entry);

  const rr = sl.amount > 0 ? (tp1Amt / sl.amount).toFixed(1) : "N/A";
  const slDirWord = direction === "long" ? "割れ" : "上抜け";

  return {
    trigger,
    entry: entryNote,
    entryPrice: entry,
    stopLoss: `${formatPrice(sl.price)}ドル${slDirWord}（ラインの外側 約${formatPrice(sl.amount)}ドル幅）`,
    stopLossPrice: sl.price,
    stopLossAmount: sl.amount,
    takeProfit1: `${formatPrice(tp1Price)}ドル（${formatPrice(tp1Amt)}ドル幅）`,
    takeProfit1Price: tp1Price,
    takeProfit1Amount: roundPrice(tp1Amt),
    takeProfit2: `${formatPrice(tp2Price)}ドル（${formatPrice(tp2Amt)}ドル幅）`,
    takeProfit2Price: tp2Price,
    takeProfit2Amount: roundPrice(tp2Amt),
    rrRatio: `1:${rr}`,
    notes,
  };
}

function buildScenarios(
  currentPrice: number,
  keyLevels: KeyLevel[],
  trend: "bullish" | "bearish" | "neutral",
  atr14: number,
  actionBridge: string,
  tradingBias: TradingBias = "neutral"
): { bullish: TradeScenario; bearish: TradeScenario; pullback: TradeScenario } {
  const supports = keyLevels
    .filter((l) => l.type === "support" && l.price <= currentPrice)
    .sort((a, b) => b.price - a.price);
  const resistances = keyLevels
    .filter((l) => l.type === "resistance" && l.price >= currentPrice)
    .sort((a, b) => a.price - b.price);

  // デイトレ〜スイング想定：エントリーは現在価格から最低 ATR×1.0（約1日分の値動き）
  // 離れたラインに置く。動画視聴が1〜2日遅れても対応できる距離を確保する。
  const minDist = atr14;
  const deepDist = atr14 * 2;

  const entrySupport =
    supports.find((l) => currentPrice - l.price >= minDist)?.price ??
    roundPrice(currentPrice - minDist);
  const entryResistance =
    resistances.find((l) => l.price - currentPrice >= minDist)?.price ??
    roundPrice(currentPrice + minDist);

  // 第3シナリオ（リテスト狙い）は ATR×2.0（約2日分）以上離れたライン
  const deepSupport =
    supports.find((l) => currentPrice - l.price >= deepDist)?.price ??
    roundPrice(currentPrice - deepDist);
  const deepResistance =
    resistances.find((l) => l.price - currentPrice >= deepDist)?.price ??
    roundPrice(currentPrice + deepDist);

  // 直近の攻防ライン（トレンド転換の確認用に注意文で使用）
  const nearestResistance = resistances[0]?.price ?? roundPrice(currentPrice * 1.03);

  // バイアス指定があればそれを主方向に。中立なら日足トレンドに従う
  const mainDirection = tradingBias !== "neutral" ? tradingBias : trend;

  const bullishNotes =
    tradingBias === "bullish"
      ? `メイン（上昇優先）。${formatPrice(entrySupport)}ドルまでの押しを待ち、反発の形を確認してから。飛びつきNG。`
      : tradingBias === "bearish"
      ? `警戒用サブ。基本目線は下。反発が明確な場合のみ短期リバ取りに留める。`
      : actionBridge;

  const bearishNotes =
    tradingBias === "bearish"
      ? `メイン（下落優先）。${formatPrice(entryResistance)}ドルへの戻りを引き付け、高値切り下がりを確認して入る。`
      : tradingBias === "bullish"
      ? `警戒用サブ。${formatPrice(nearestResistance)}ドルを上抜けできず反落した場合のみ。無理なショートは控える。`
      : `基本目線は${trend === "bearish" ? "下" : trend === "bullish" ? "上" : "中立"}。高値切り下がりを確認してから入る。`;

  const bullish = buildScenario({
    direction: "long",
    entryPrice: entrySupport,
    trigger: `${formatPrice(entrySupport)}ドルへの押しを待つ → 下ヒゲ＋4時間足陽線確定で反発確認`,
    entryNote: `${formatPrice(entrySupport)}ドル付近でロング`,
    keyLevels,
    atr14,
    notes: bullishNotes,
  });

  const bearish = buildScenario({
    direction: "short",
    entryPrice: entryResistance,
    trigger: `${formatPrice(entryResistance)}ドルへの戻りを待つ → 上ヒゲ陰線確定で反落確認`,
    entryNote: `${formatPrice(entryResistance)}ドル付近でショート`,
    keyLevels,
    atr14,
    notes: bearishNotes,
  });

  // 第3シナリオ：主方向（バイアス優先）へのリテスト狙い（さらに深い位置）
  const pullback =
    mainDirection === "bullish"
      ? buildScenario({
          direction: "long",
          entryPrice: deepSupport,
          trigger: `${formatPrice(entrySupport)}ドルを割って深押し → ${formatPrice(deepSupport)}ドルで下ヒゲ陽線確定`,
          entryNote: `${formatPrice(deepSupport)}ドルまで引き付けてロング`,
          keyLevels,
          atr14,
          notes: "深押し時の押し目買い。より有利な価格で乗れる。リテスト確認後に入る。",
        })
      : buildScenario({
          direction: "short",
          entryPrice: deepResistance,
          trigger: `${formatPrice(deepResistance)}ドルまで反発 → 上ヒゲ陰線確定で戻り売り`,
          entryNote: `${formatPrice(deepResistance)}ドルまで引き付けてショート`,
          keyLevels,
          atr14,
          notes: "深い戻りの売り場。長期トレンドで上から抑えられるポイント。",
        });

  return { bullish, bearish, pullback };
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
    confluence.actionBridge,
    tradingBias
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
      analogy: conceptFourStep.analogy,
      ngAction: conceptFourStep.ngAction,
      commentPrompt: conceptFourStep.commentPrompt,
    },
  };
}
