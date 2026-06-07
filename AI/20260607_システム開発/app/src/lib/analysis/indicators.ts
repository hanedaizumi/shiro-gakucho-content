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

export function roundPrice(price: number): number {
  if (price >= 10000) return Math.round(price / 50) * 50;
  if (price >= 1000) return Math.round(price / 10) * 10;
  return Math.round(price);
}

export function formatPrice(price: number): string {
  return roundPrice(price).toLocaleString("en-US");
}
