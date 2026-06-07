export interface CmcData {
  marketCap: number;
  dominance: number;
  change24h: number;
  rank: number;
}

export async function collectCoinMarketCapData(): Promise<CmcData | null> {
  const apiKey = process.env.COINMARKETCAP_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=BTC&convert=USD",
      {
        headers: { "X-CMC_PRO_API_KEY": apiKey },
        next: { revalidate: 0 },
      }
    );
    if (!res.ok) return null;

    const json = (await res.json()) as {
      data: {
        BTC: {
          cmc_rank: number;
          quote: {
            USD: {
              market_cap: number;
              percent_change_24h: number;
            };
          };
        };
      };
    };

    const btc = json.data.BTC;

    const globalRes = await fetch(
      "https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest",
      {
        headers: { "X-CMC_PRO_API_KEY": apiKey },
        next: { revalidate: 0 },
      }
    );

    let dominance = 0;
    if (globalRes.ok) {
      const globalJson = (await globalRes.json()) as {
        data: { btc_dominance: number };
      };
      dominance = globalJson.data.btc_dominance;
    }

    return {
      marketCap: btc.quote.USD.market_cap,
      dominance,
      change24h: btc.quote.USD.percent_change_24h,
      rank: btc.cmc_rank,
    };
  } catch {
    return null;
  }
}
