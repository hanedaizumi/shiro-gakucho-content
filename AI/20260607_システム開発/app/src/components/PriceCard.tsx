"use client";

import { useEffect, useState } from "react";

interface PriceData {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
}

export function PriceCard() {
  const [data, setData] = useState<PriceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/price")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("価格取得失敗"));
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <p className="text-sm text-[var(--danger)]">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <p className="text-sm text-[var(--muted)]">価格を取得中...</p>
      </div>
    );
  }

  const isUp = data.change24h >= 0;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <p className="text-sm text-[var(--muted)]">BTC/USDT（Binance）</p>
      <p className="mt-2 text-3xl font-bold">
        ${data.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}
      </p>
      <p className={`mt-1 text-sm ${isUp ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
        24h {isUp ? "+" : ""}
        {data.change24h.toFixed(2)}%
      </p>
      <p className="mt-2 text-xs text-[var(--muted)]">
        High ${data.high24h.toLocaleString()} / Low ${data.low24h.toLocaleString()}
      </p>
    </div>
  );
}
