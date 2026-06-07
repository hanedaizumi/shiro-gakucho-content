import { collectBinanceData } from "./binance";
import { collectCoinMarketCapData } from "./coinmarketcap";
import { collectNewsRss } from "./news-rss";
import { collectYouTubeVideos, type YouTubeVideo } from "./youtube";
import { analyzeYouTubeVideo, buildYouTubeConsensus } from "./youtube-analyzer";
import { loadSettings } from "@/lib/settings/store";
import type { YouTubeVideoAnalysis } from "./youtube-analyzer";

export interface CollectedData {
  binance: Awaited<ReturnType<typeof collectBinanceData>>;
  cmc: Awaited<ReturnType<typeof collectCoinMarketCapData>>;
  news: Awaited<ReturnType<typeof collectNewsRss>>;
  youtube: YouTubeVideo[];
  youtubeAnalysis: YouTubeVideoAnalysis[];
  youtubeConsensus: ReturnType<typeof buildYouTubeConsensus>;
}

export async function collectAllData(): Promise<CollectedData> {
  const settings = await loadSettings();

  const [binance, cmc, news, youtubeResult] = await Promise.all([
    collectBinanceData(),
    collectCoinMarketCapData(),
    collectNewsRss(),
    collectYouTubeVideos({
      watchedChannels: settings.youtubeChannels,
      searchQueriesJa: settings.youtubeSearchQueries,
      searchQueriesEn: ["BTC technical analysis", "bitcoin chart analysis"],
      maxAgeHours: settings.youtubeMaxAgeHours,
    }),
  ]);

  const youtube = youtubeResult.videos;
  const youtubeAnalysis = youtube.map((v) => analyzeYouTubeVideo(v));
  const youtubeConsensus = buildYouTubeConsensus(youtubeAnalysis);

  return {
    binance,
    cmc,
    news,
    youtube,
    youtubeAnalysis,
    youtubeConsensus,
  };
}

export {
  collectBinanceData,
  collectCoinMarketCapData,
  collectNewsRss,
  collectYouTubeVideos,
};
