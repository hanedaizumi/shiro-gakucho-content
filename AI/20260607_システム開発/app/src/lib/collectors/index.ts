import { collectBinanceData } from "./binance";
import { collectCoinMarketCapData } from "./coinmarketcap";
import { collectNewsRss } from "./news-rss";
import { collectYouTubeVideos } from "./youtube";
import { collectXPosts } from "./x-api";

export interface CollectedData {
  binance: Awaited<ReturnType<typeof collectBinanceData>>;
  cmc: Awaited<ReturnType<typeof collectCoinMarketCapData>>;
  news: Awaited<ReturnType<typeof collectNewsRss>>;
  youtube: Awaited<ReturnType<typeof collectYouTubeVideos>>;
  xPosts: Awaited<ReturnType<typeof collectXPosts>>;
}

export async function collectAllData(options?: {
  manualXPosts?: string | null;
  youtubeQueries?: string[];
}): Promise<CollectedData> {
  const [binance, cmc, news, youtube, xPosts] = await Promise.all([
    collectBinanceData(),
    collectCoinMarketCapData(),
    collectNewsRss(),
    collectYouTubeVideos(options?.youtubeQueries),
    collectXPosts(options?.manualXPosts),
  ]);

  return { binance, cmc, news, youtube, xPosts };
}

export { collectBinanceData, collectCoinMarketCapData, collectNewsRss, collectYouTubeVideos, collectXPosts };
