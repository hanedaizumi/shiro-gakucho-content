export interface ResolvedCoin {
  symbol: string;
  name: string;
  binancePair: string;
  keywords: string[];
  searchQueries: string[];
}

const KNOWN: Record<string, Omit<ResolvedCoin, "binancePair"> & { pair?: string }> = {
  btc: {
    symbol: "BTC",
    name: "ビットコイン",
    keywords: ["bitcoin", "btc", "ビットコイン", "ビットコ"],
    searchQueries: ["ビットコイン チャート分析", "BTC technical analysis 日本語"],
  },
  xrp: {
    symbol: "XRP",
    name: "リップル",
    keywords: ["ripple", "xrp", "リップル", "リップルxrp"],
    searchQueries: [
      "リップル XRP 仮想通貨",
      "XRP ETF 法案",
      "リップル チャート分析",
      "XRP ripple analysis",
      "XRP Goldman Sachs sell",
      "XRP CLARITY Act",
      "ripple xrp news english",
    ],
  },
  eth: {
    symbol: "ETH",
    name: "イーサリアム",
    keywords: ["ethereum", "eth", "イーサリアム", "イーサ"],
    searchQueries: ["イーサリアム ETH 仮想通貨", "ETH technical analysis"],
  },
  sol: {
    symbol: "SOL",
    name: "ソラナ",
    keywords: ["solana", "sol", "ソラナ"],
    searchQueries: ["ソラナ SOL 仮想通貨", "SOL chart analysis"],
  },
  ada: {
    symbol: "ADA",
    name: "カルダノ",
    keywords: ["cardano", "ada", "カルダノ"],
    searchQueries: ["カルダノ ADA 仮想通貨"],
  },
  doge: {
    symbol: "DOGE",
    name: "ドージコイン",
    keywords: ["dogecoin", "doge", "ドージコイン"],
    searchQueries: ["ドージコイン DOGE 仮想通貨"],
  },
};

export function resolveCoinInput(input: string): ResolvedCoin {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("コイン名を入力してください");

  const upperTokens = trimmed.match(/[A-Z]{2,10}/g) ?? [];
  const lower = trimmed.toLowerCase();

  for (const token of upperTokens) {
    const key = token.toLowerCase();
    if (KNOWN[key]) return toResolved(KNOWN[key]);
  }

  for (const [key, coin] of Object.entries(KNOWN)) {
    if (lower.includes(key) || coin.keywords.some((k) => lower.includes(k))) {
      return toResolved(coin);
    }
  }

  const fallbackSymbol = upperTokens[0] ?? trimmed.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 6);
  if (!fallbackSymbol || fallbackSymbol.length < 2) {
    throw new Error("コインを認識できません。例: ビットコイン BTC / リップル XRP");
  }

  return {
    symbol: fallbackSymbol,
    name: trimmed,
    binancePair: `${fallbackSymbol}USDT`,
    keywords: [fallbackSymbol.toLowerCase(), trimmed.toLowerCase()],
    searchQueries: [`${fallbackSymbol} 仮想通貨`, `${fallbackSymbol} crypto analysis`],
  };
}

function toResolved(
  coin: Omit<ResolvedCoin, "binancePair"> & { pair?: string }
): ResolvedCoin {
  return {
    symbol: coin.symbol,
    name: coin.name,
    binancePair: coin.pair ?? `${coin.symbol}USDT`,
    keywords: coin.keywords,
    searchQueries: coin.searchQueries,
  };
}

export function listKnownCoins(): Array<{ symbol: string; name: string; example: string }> {
  return Object.values(KNOWN).map((c) => ({
    symbol: c.symbol,
    name: c.name,
    example: `${c.name} ${c.symbol}`,
  }));
}
