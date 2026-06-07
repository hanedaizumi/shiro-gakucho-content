export interface CmcData {
  marketCap: number;
  dominance: number;
  change24h: number;
  rank: number;
  price?: number;
}

export async function collectCoinMarketCapData(symbol = "BTC"): Promise<CmcData | null> {
  const apiKey = process.env.COINMARKETCAP_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbol}&convert=USD`,
      {
        headers: { "X-CMC_PRO_API_KEY": apiKey },
        next: { revalidate: 0 },
      }
    );
    if (!res.ok) return null;

    const json = (await res.json()) as {
      data: Record<
        string,
        {
          cmc_rank: number;
          quote: {
            USD: {
              market_cap: number;
              percent_change_24h: number;
              price: number;
            };
          };
        }
      >;
    };

    const coin = json.data[symbol];
    if (!coin) return null;

    let dominance = 0;
    if (symbol === "BTC") {
      const globalRes = await fetch(
        "https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest",
        {
          headers: { "X-CMC_PRO_API_KEY": apiKey },
          next: { revalidate: 0 },
        }
      );
      if (globalRes.ok) {
        const globalJson = (await globalRes.json()) as {
          data: { btc_dominance: number };
        };
        dominance = globalJson.data.btc_dominance;
      }
    }

    return {
      marketCap: coin.quote.USD.market_cap,
      dominance,
      change24h: coin.quote.USD.percent_change_24h,
      rank: coin.cmc_rank,
      price: coin.quote.USD.price,
    };
  } catch {
    return null;
  }
}
