import type { CollectedData } from "@/lib/collectors";
import type { TechnicalAnalysis, TradeScenario } from "@/lib/types";
import { calculateRSI, calculateSMA, formatPrice, roundPrice } from "./indicators";
import { deriveKeyLevels, detectTrend, findSwingPoints } from "./levels";

const USED_CONCEPTS_ROTATION = [
  "ダウ理論の厳密定義",
  "エリオット波動",
  "オーダーブロック",
  "逆三尊の正しい見方",
  "200日移動平均線との乖離率",
  "価格帯出来高",
  "フィボナッチ0.618",
];

function buildScenarios(
  currentPrice: number,
  keyLevels: ReturnType<typeof deriveKeyLevels>,
  trend: "bullish" | "bearish" | "neutral"
): { bullish: TradeScenario; bearish: TradeScenario } {
  const supports = keyLevels
    .filter((l) => l.type === "support" && l.price <= currentPrice)
    .sort((a, b) => b.price - a.price);
  const resistances = keyLevels
    .filter((l) => l.type === "resistance" && l.price >= currentPrice)
    .sort((a, b) => a.price - b.price);

  const nearestSupport = supports[0]?.price ?? roundPrice(currentPrice * 0.97);
  const nextSupport = supports[1]?.price ?? roundPrice(nearestSupport * 0.95);
  const nearestResistance =
    resistances[0]?.price ?? roundPrice(currentPrice * 1.05);
  const nextResistance =
    resistances[1]?.price ?? roundPrice(nearestResistance * 1.04);

  const entryLong = roundPrice(nearestSupport);
  const stopLong = roundPrice(entryLong * 0.985);
  const tp1Long = nearestResistance;
  const tp2Long = nextResistance;

  const entryShort = roundPrice(nearestResistance);
  const stopShort = roundPrice(entryShort * 1.02);
  const tp1Short = roundPrice((entryShort + nearestSupport) / 2);
  const tp2Short = nearestSupport;

  const bullish: TradeScenario = {
    trigger: `${formatPrice(entryLong)}ドル付近で4時間足陽線確定（下ヒゲ反発）`,
    entry: `${formatPrice(entryLong)}ドル付近でロング。反発の形を確認してからエントリー`,
    stopLoss: `${formatPrice(stopLong)}ドル割れ（実体で割れたら即撤退）`,
    takeProfit1: `${formatPrice(tp1Long)}ドル付近で一部利確`,
    takeProfit2: `${formatPrice(tp2Long)}ドル付近（第1目標突破後のみ）`,
    notes: "先回りせず4時間足の実体確定を待つ。ポジションサイズは口座の2%まで",
  };

  const bearish: TradeScenario = {
    trigger: `${formatPrice(nearestSupport)}ドルを4時間足実体で割る、または${formatPrice(entryShort)}ドル付近で戻り売り形成`,
    entry: `${formatPrice(entryShort)}ドル付近で上ヒゲ・陰線確認後にショート`,
    stopLoss: `${formatPrice(stopShort)}ドルを実体で上抜けた場合`,
    takeProfit1: `${formatPrice(tp1Short)}ドル付近`,
    takeProfit2: `${formatPrice(tp2Short)}ドル付近`,
    notes: "高値切り下がりを確認してから入る。ポジションサイズは口座の2%まで",
  };

  if (trend === "bearish") {
    bearish.notes = `基本目線は下。${bearish.notes}`;
  }

  return { bullish, bearish };
}

function suggestConcept(
  ma200Divergence: number,
  rsi: number,
  usedConcepts: string[]
): { name: string; reason: string } {
  const available = USED_CONCEPTS_ROTATION.filter((c) => !usedConcepts.includes(c));
  const pick = available[0] ?? USED_CONCEPTS_ROTATION[0];

  if (Math.abs(ma200Divergence) > 15 && !usedConcepts.includes("200日移動平均線との乖離率")) {
    return {
      name: "200日移動平均線との乖離率",
      reason: `現在の乖離率は${ma200Divergence.toFixed(1)}%で、機関投資家が注目する水準`,
    };
  }
  if (rsi < 35 && !usedConcepts.includes("RSI売られすぎ")) {
    return {
      name: "RSI売られすぎゾーン",
      reason: `RSI ${rsi.toFixed(0)}は短期反発が起きやすい水準`,
    };
  }

  return { name: pick, reason: "直近4本の台本と被らない概念として選定" };
}

export function runTechnicalAnalysis(
  data: CollectedData,
  usedConcepts: string[] = []
): TechnicalAnalysis {
  const { daily, h4 } = data.binance.candles;
  const currentPrice = data.binance.price;
  const closes = daily.map((c) => c.close);

  const ma200 = calculateSMA(closes, 200) ?? closes[closes.length - 1];
  const ma200Divergence = ((currentPrice - ma200) / ma200) * 100;
  const rsiDaily = calculateRSI(daily) ?? 50;
  const rsi4h = calculateRSI(h4) ?? 50;

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

  const last5 = daily.slice(-5);
  const upperWicks = last5.filter((c) => c.high - Math.max(c.open, c.close) > (c.high - c.low) * 0.4).length;
  const lowerWicks = last5.filter((c) => Math.min(c.open, c.close) - c.low > (c.high - c.low) * 0.4).length;

  let candleCharacteristics = "特筆すべきローソク足パターンは限定的";
  if (upperWicks >= 3) candleCharacteristics = "上ヒゲの長い陰線・陽線が連続し、上値抵抗が強い";
  if (lowerWicks >= 3) candleCharacteristics = "下ヒゲが連続し、下値で買い支えが入っている";

  const recentVol = daily.slice(-5).map((c) => c.volume);
  const avgVol = daily.slice(-30).reduce((s, c) => s + c.volume, 0) / 30;
  const volumeSpike = recentVol.some((v) => v > avgVol * 1.8);

  const scenarios = buildScenarios(currentPrice, keyLevels, trend);
  const conceptSuggestion = suggestConcept(ma200Divergence, rsiDaily, usedConcepts);

  return {
    currentPrice: roundPrice(currentPrice),
    change24h: data.binance.ticker24h.changePercent,
    change7d,
    trend,
    trendReasons: reasons,
    ma200: roundPrice(ma200),
    ma200Divergence,
    rsiDaily,
    rsi4h,
    swingHighs: highs,
    swingLows: lows,
    keyLevels,
    trendReversalCondition: `${formatPrice(reversalLevel)}ドルを日足実体で上抜けすること`,
    candleCharacteristics,
    volumeSpike,
    scenarios,
    conceptSuggestion,
  };
}
