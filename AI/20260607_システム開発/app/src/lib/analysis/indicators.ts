import type { Candle } from "@/lib/types";

export function calculateSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function calculateRSI(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;

  const closes = candles.map((c) => c.close);
  let gains = 0;
  let losses = 0;

  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * ATR(平均真の値幅) を計算する。
 * True Range = max(high-low, |high-prevClose|, |low-prevClose|)
 * インジケーター: ta.atr(14) と同ロジック（単純平均）
 */
export function calculateATR(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) {
    const recent = candles.slice(-5);
    return recent.length
      ? recent.reduce((s, c) => s + (c.high - c.low), 0) / recent.length
      : 0;
  }

  const subset = candles.slice(-(period + 1));
  let sum = 0;
  for (let i = 1; i < subset.length; i++) {
    const c = subset[i];
    const prev = subset[i - 1].close;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev),
      Math.abs(c.low - prev)
    );
    sum += tr;
  }
  return sum / period;
}

/**
 * 短期EMA（指数移動平均）を計算する。
 * インジケーターの EMA20/50/100/200 と同ロジック。
 */
export function calculateEMA(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
}

/**
 * ボリンジャーバンド上下バンドを計算する。
 */
export function calculateBollingerBands(
  candles: Candle[],
  period = 20,
  mult = 2
): { upper: number; lower: number; basis: number } | null {
  if (candles.length < period) return null;
  const closes = candles.slice(-period).map((c) => c.close);
  const basis = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((a, b) => a + Math.pow(b - basis, 2), 0) / period;
  const stddev = Math.sqrt(variance);
  return { upper: basis + mult * stddev, lower: basis - mult * stddev, basis };
}

/**
 * 直近のローソク足の特徴を日本語で説明する。
 */
export function describeCandlePattern(candles: Candle[], tfLabel: string): string {
  if (candles.length < 3) return `${tfLabel}: データ不足`;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];

  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low;
  const upperWick = last.high - Math.max(last.close, last.open);
  const lowerWick = Math.min(last.close, last.open) - last.low;
  const isBullish = last.close > last.open;

  const parts: string[] = [];

  // 基本形状
  if (body < range * 0.1) {
    parts.push("十字線（コマ足）");
  } else if (isBullish) {
    if (body > range * 0.7) parts.push("大陽線");
    else if (lowerWick > body * 1.5) parts.push("下ヒゲ長い陽線（反発示唆）");
    else parts.push("陽線");
  } else {
    if (body > range * 0.7) parts.push("大陰線");
    else if (upperWick > body * 1.5) parts.push("上ヒゲ長い陰線（売り圧示唆）");
    else parts.push("陰線");
  }

  // 連続性
  const trend3 = [prev2, prev, last].every((c) => c.close > c.open)
    ? "3本連続陽線（強い上昇圧力）"
    : [prev2, prev, last].every((c) => c.close < c.open)
    ? "3本連続陰線（強い下降圧力）"
    : "";
  if (trend3) parts.push(trend3);

  // 出来高
  const avgVolume =
    candles.slice(-10, -1).reduce((s, c) => s + c.volume, 0) / 9;
  if (last.volume > avgVolume * 1.5) parts.push("出来高急増（${Math.round(last.volume / avgVolume * 10) / 10}倍）");
  else if (last.volume < avgVolume * 0.5) parts.push("出来高低下（${Math.round(last.volume / avgVolume * 10) / 10}倍）");

  return `${tfLabel}: ${parts.join(" / ") || "通常のローソク足"}`;
}

export function roundPrice(price: number): number {
  if (price >= 10000) return Math.round(price / 50) * 50;
  if (price >= 1000) return Math.round(price / 10) * 10;
  return Math.round(price);
}

export function formatPrice(price: number): string {
  return roundPrice(price).toLocaleString("en-US");
}
