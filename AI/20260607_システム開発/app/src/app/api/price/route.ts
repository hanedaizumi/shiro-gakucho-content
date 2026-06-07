import { NextResponse } from "next/server";
import { fetchTickerPrice, fetch24hTicker } from "@/lib/collectors/binance";

export async function GET() {
  try {
    const [price, ticker] = await Promise.all([
      fetchTickerPrice(),
      fetch24hTicker(),
    ]);

    return NextResponse.json({
      price,
      change24h: parseFloat(ticker.priceChangePercent),
      high24h: parseFloat(ticker.highPrice),
      low24h: parseFloat(ticker.lowPrice),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
