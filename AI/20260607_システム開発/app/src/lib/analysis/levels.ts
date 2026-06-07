import type { Candle, KeyLevel, SwingPoint } from "@/lib/types";
import { roundPrice } from "./indicators";

export function findSwingPoints(candles: Candle[], lookback = 90): {
  highs: SwingPoint[];
  lows: SwingPoint[];
} {
  const recent = candles.slice(-lookback);
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];
  const window = 3;

  for (let i = window; i < recent.length - window; i++) {
    const c = recent[i];
    const date = new Date(c.closeTime).toISOString().split("T")[0];

    const isHigh = recent
      .slice(i - window, i + window + 1)
      .every((x, idx) => idx === window || x.high <= c.high);
    const isLow = recent
      .slice(i - window, i + window + 1)
      .every((x, idx) => idx === window || x.low >= c.low);

    if (isHigh) highs.push({ price: roundPrice(c.high), type: "high", date });
    if (isLow) lows.push({ price: roundPrice(c.low), type: "low", date });
  }

  return { highs: dedupeSwings(highs), lows: dedupeSwings(lows) };
}

function dedupeSwings(points: SwingPoint[]): SwingPoint[] {
  const sorted = [...points].sort((a, b) => b.price - a.price);
  const result: SwingPoint[] = [];
  for (const p of sorted) {
    if (!result.some((r) => Math.abs(r.price - p.price) / p.price < 0.01)) {
      result.push(p);
    }
  }
  return result.slice(0, 8);
}

export function deriveKeyLevels(
  candles: Candle[],
  currentPrice: number
): KeyLevel[] {
  const { highs, lows } = findSwingPoints(candles);
  const levels: KeyLevel[] = [];

  for (const h of highs) {
    if (h.price > currentPrice * 0.98) {
      levels.push({
        price: h.price,
        type: "resistance",
        reason: `${h.date}のスイング高値`,
        strength: h.price > currentPrice ? 3 : 2,
      });
    }
  }

  for (const l of lows) {
    if (l.price < currentPrice * 1.02) {
      levels.push({
        price: l.price,
        type: "support",
        reason: `${l.date}のスイング安値`,
        strength: l.price < currentPrice ? 3 : 2,
      });
    }
  }

  // Volume cluster: high volume day closes
  const recent = candles.slice(-30);
  const avgVol = recent.reduce((s, c) => s + c.volume, 0) / recent.length;
  for (const c of recent) {
    if (c.volume > avgVol * 1.5) {
      const price = roundPrice(c.close);
      const type = price > currentPrice ? "resistance" : "support";
      levels.push({
        price,
        type,
        reason: "高出来日の終値クラスタ",
        strength: 2,
      });
    }
  }

  // Round numbers
  const roundBases = [1000, 5000];
  for (const base of roundBases) {
    const nearest = Math.round(currentPrice / base) * base;
    for (const offset of [-base, 0, base]) {
      const p = nearest + offset;
      if (p > 0 && Math.abs(p - currentPrice) / currentPrice < 0.15) {
        levels.push({
          price: p,
          type: p > currentPrice ? "resistance" : "support",
          reason: `${p.toLocaleString()}ドルの心理ライン`,
          strength: 1,
        });
      }
    }
  }

  return mergeLevels(levels).slice(0, 10);
}

function mergeLevels(levels: KeyLevel[]): KeyLevel[] {
  const sorted = [...levels].sort((a, b) => b.strength - a.strength || b.price - a.price);
  const merged: KeyLevel[] = [];

  for (const l of sorted) {
    const existing = merged.find(
      (m) => Math.abs(m.price - l.price) / l.price < 0.008
    );
    if (existing) {
      existing.strength = Math.max(existing.strength, l.strength);
      existing.reason = `${existing.reason}、${l.reason}`;
    } else {
      merged.push({ ...l });
    }
  }

  return merged.sort((a, b) => b.price - a.price);
}

export function detectTrend(candles: Candle[]): {
  trend: "bullish" | "bearish" | "neutral";
  reasons: string[];
} {
  const { highs, lows } = findSwingPoints(candles, 60);
  const reasons: string[] = [];

  const recentHighs = highs.slice(0, 3);
  const recentLows = lows.slice(0, 3);

  let lowerHighs = 0;
  let lowerLows = 0;
  let higherHighs = 0;
  let higherLows = 0;

  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i - 1].price < recentHighs[i].price) higherHighs++;
    else lowerHighs++;
  }
  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i - 1].price < recentLows[i].price) higherLows++;
    else lowerLows++;
  }

  const last10 = candles.slice(-10);
  const brokenSupports = last10.filter((c, i) => {
    if (i === 0) return false;
    const prev = candles[candles.length - 11 + i - 1];
    return c.close < prev.low;
  }).length;

  if (lowerHighs >= 1 && lowerLows >= 1) {
    reasons.push("高値・安値がともに切り下がっており、下落トレンドが継続");
  }
  if (brokenSupports >= 2) {
    reasons.push("水平サポートを次々と実体で割っている");
  }
  if (higherHighs >= 1 && higherLows >= 1) {
    reasons.push("高値・安値が切り上がっており、上昇トレンド");
  }

  if (lowerHighs >= 1 || brokenSupports >= 2) {
    return { trend: "bearish", reasons };
  }
  if (higherHighs >= 1 && higherLows >= 1) {
    return { trend: "bullish", reasons };
  }
  return { trend: "neutral", reasons: reasons.length ? reasons : ["レンジ圏内で方向感が限定的"] };
}
