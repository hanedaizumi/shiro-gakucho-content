import type { ResolvedCoin } from "@/lib/coins/resolver";
import { collectBinanceData } from "./binance";
import { collectCoinMarketCapData } from "./coinmarketcap";
import { collectCoinNews } from "./coin-news";
import {
  collectYouTubeVideos,
  type YouTubeCollectDiagnostics,
} from "./youtube";
import { analyzeYouTubeVideo, buildYouTubeConsensus } from "./youtube-analyzer";
import { loadSettings } from "@/lib/settings/store";
import type { YouTubeVideoAnalysis } from "./youtube-analyzer";
import type { PlanningContext } from "@/lib/planning/context";
import {
  buildYouTubeSearchQueries,
  YOUTUBE_MAX_AGE_HOURS,
} from "./youtube-queries";
import {
  NEWS_COLLECT_LIMIT,
  selectYouTubeForScript,
  YOUTUBE_COLLECT_LIMIT,
} from "@/lib/planning/selection";

export type CoinResearchMode = "fundamentals" | "technical" | "both";

export interface CoinCollectedData {
  coin: ResolvedCoin;
  mode: CoinResearchMode;
  planning: PlanningContext;
  binance: Awaited<ReturnType<typeof collectBinanceData>>;
  cmc: Awaited<ReturnType<typeof collectCoinMarketCapData>>;
  news: Awaited<ReturnType<typeof collectCoinNews>>;
  youtube: Awaited<ReturnType<typeof collectYouTubeVideos>>["videos"];
  youtubeDiagnostics: YouTubeCollectDiagnostics | null;
  youtubeAnalysis: YouTubeVideoAnalysis[];
  youtubeConsensus: ReturnType<typeof buildYouTubeConsensus>;
}

export async function collectCoinData(
  coin: ResolvedCoin,
  mode: CoinResearchMode,
  planning: PlanningContext
): Promise<CoinCollectedData> {
  const settings = await loadSettings();
  const includeFundamentals = mode === "fundamentals" || mode === "both";
  const includeTechnical = mode === "technical" || mode === "both";
  const { ja: jaQueries, en: enQueries } = buildYouTubeSearchQueries(
    coin,
    planning
  );

  const [binance, cmc, news, youtubeResult] = await Promise.all([
    includeTechnical ? collectBinanceData(coin.binancePair) : Promise.resolve(null),
    collectCoinMarketCapData(coin.symbol),
    includeFundamentals
      ? collectCoinNews(coin.keywords, {
          maxItems: NEWS_COLLECT_LIMIT,
          maxAgeDays: 90,
          planning,
        })
      : Promise.resolve([]),
    includeFundamentals
      ? collectYouTubeVideos({
          watchedChannels: settings.youtubeChannels,
          searchQueriesJa: jaQueries,
          searchQueriesEn: enQueries,
          relevanceTerms: [
            coin.symbol,
            coin.name,
            ...coin.keywords,
          ],
          maxAgeHours: YOUTUBE_MAX_AGE_HOURS,
          maxVideos: YOUTUBE_COLLECT_LIMIT,
          minSpreadRate: 2.0,
        })
      : Promise.resolve({ videos: [], diagnostics: null }),
  ]);

  const youtube = includeFundamentals
    ? youtubeResult.videos
    : [];
  const youtubeDiagnostics = includeFundamentals
    ? youtubeResult.diagnostics
    : null;

  const youtubeAnalysisAll = youtube.map((v) =>
    analyzeYouTubeVideo(v, planning)
  );
  const youtubeAnalysis = selectYouTubeForScript(youtubeAnalysisAll, planning);
  const selectedIds = new Set(youtubeAnalysis.map((a) => a.videoId));
  const youtubeSelected = youtube.filter((v) => selectedIds.has(v.videoId));
  const youtubeConsensus = buildYouTubeConsensus(youtubeAnalysis);

  if (!binance && includeTechnical) {
    throw new Error(`${coin.binancePair} のBinanceデータを取得できませんでした`);
  }

  return {
    coin,
    mode,
    planning,
    binance: binance ?? {
      symbol: coin.binancePair,
      price: cmc?.price ?? 0,
      ticker24h: { changePercent: cmc?.change24h ?? 0, high: 0, low: 0, volume: 0 },
      candles: { daily: [], h4: [], h1: [] },
      fetchedAt: new Date().toISOString(),
    },
    cmc,
    news,
    youtube: youtubeSelected,
    youtubeDiagnostics,
    youtubeAnalysis,
    youtubeConsensus,
  };
}
