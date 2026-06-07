import type { Candle } from "@/lib/types";

const BASE_URL = "https://api.binance.com/api/v3";

export async function fetchTickerPrice(symbol = "BTCUSDT"): Promise<number> {
  const res = await fetch(`${BASE_URL}/ticker/price?symbol=${symbol}`, {
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Binance ticker failed: ${res.status}`);
  const data = (await res.json()) as { price: string };
  return parseFloat(data.price);
}

export async function fetch24hTicker(symbol = "BTCUSDT") {
  const res = await fetch(`${BASE_URL}/ticker/24hr?symbol=${symbol}`, {
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Binance 24h ticker failed: ${res.status}`);
  return res.json() as Promise<{
    lastPrice: string;
    priceChangePercent: string;
    highPrice: string;
    lowPrice: string;
    volume: string;
  }>;
}

export async function fetchKlines(
  interval: "1h" | "4h" | "1d",
  limit = 250,
  symbol = "BTCUSDT"
): Promise<Candle[]> {
  const res = await fetch(
    `${BASE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    { next: { revalidate: 0 } }
  );
  if (!res.ok) throw new Error(`Binance klines failed: ${res.status}`);
  const raw = (await res.json()) as Array<
    [number, string, string, string, string, string, number, string, number, string, string, string]
  >;

  return raw.map((k) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
  }));
}

export async function collectBinanceData(symbol = "BTCUSDT") {
  const [price, ticker24h, daily, h4, h1] = await Promise.all([
    fetchTickerPrice(symbol),
    fetch24hTicker(symbol),
    fetchKlines("1d", 250, symbol),
    fetchKlines("4h", 250, symbol),
    fetchKlines("1h", 100, symbol),
  ]);

  return {
    symbol,
    price,
    ticker24h: {
      changePercent: parseFloat(ticker24h.priceChangePercent),
      high: parseFloat(ticker24h.highPrice),
      low: parseFloat(ticker24h.lowPrice),
      volume: parseFloat(ticker24h.volume),
    },
    candles: { daily, h4, h1 },
    fetchedAt: new Date().toISOString(),
  };
}
