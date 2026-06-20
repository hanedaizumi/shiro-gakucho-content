import type { WatchedYouTubeChannel } from "@/lib/settings/types";
import { fetchYouTubeTranscript } from "./youtube-transcript";
import {
  buildSearchCacheKey,
  getCachedSearchIds,
  setCachedSearchIds,
} from "./youtube-search-cache";
import { YouTubeApiKeyPool, loadYouTubeApiKeys } from "./youtube-api-keys";

export interface YouTubeVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId?: string;
  description: string;
  transcript: string;
  publishedAt: string;
  url: string;
  fromWatchedChannel: boolean;
  contentSource: "transcript" | "description" | "title_only";
  viewCount: number;
  subscriberCount: number;
  spreadRate: number;
  isInternational: boolean;
}

export interface YouTubeSearchError {
  query?: string;
  channelId?: string;
  status: number;
  message: string;
}

export interface YouTubeCollectDiagnostics {
  searchCalls: number;
  searchCacheHits: number;
  searchErrors: YouTubeSearchError[];
  candidateIds: number;
  afterRelevanceFilter: number;
  afterSpreadFilter: number;
  quotaExceeded: boolean;
  apiKeyCount: number;
  fallbackApiKeyUsed: boolean;
}

export interface YouTubeCollectResult {
  videos: YouTubeVideo[];
  diagnostics: YouTubeCollectDiagnostics;
}

export interface YouTubeCollectOptions {
  watchedChannels?: WatchedYouTubeChannel[];
  searchQueriesJa?: string[];
  searchQueriesEn?: string[];
  /** タイトル・概要欄に含まれるべきキーワード（コイン関連性フィルタ） */
  relevanceTerms?: string[];
  maxAgeHours?: number;
  maxVideos?: number;
  minSpreadRate?: number;
}

const DEFAULT_QUERIES_JA = ["ビットコイン チャート分析"];
const DEFAULT_QUERIES_EN = ["BTC technical analysis"];

const MIN_SPREAD_RATE_DEFAULT = 2.0;

function publishedAfterIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function isWithinMaxAge(publishedAt: string, maxAgeHours: number): boolean {
  const age = Date.now() - new Date(publishedAt).getTime();
  return age <= maxAgeHours * 60 * 60 * 1000;
}

/** タイトル＋説明文のいずれかに対象コインのキーワードが含まれるか */
function isRelevantToCoin(
  title: string,
  description: string,
  terms: string[]
): boolean {
  if (!terms.length) return true;
  const text = `${title} ${description}`.toLowerCase();
  return terms.some((t) => text.includes(t.toLowerCase()));
}

/**
 * タイトル単体でコイン関連性を判定する（より厳密なフィルタ）。
 * 概要欄にコイン名が出てくるだけの他コイン動画を除外するために使用。
 */
function isTitleRelevantToCoin(title: string, terms: string[]): boolean {
  if (!terms.length) return true;
  const t = title.toLowerCase();
  return terms.some((term) => t.includes(term.toLowerCase()));
}

/** YouTube ショート動画を検出する（タイトル・概要欄の #shorts タグで判定） */
function isShortVideo(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();
  return (
    /#shorts\b/.test(text) ||
    /#short\b/.test(text) ||
    /#youtubeshorts\b/.test(text) ||
    /#shortsvideo\b/.test(text) ||
    /\byt-?shorts\b/.test(text)
  );
}

function detectInternational(title: string, description: string): boolean {
  const text = `${title} ${description}`;
  const jaChars = (text.match(/[\u3040-\u9fff]/g) ?? []).length;
  const enChars = (text.match(/[a-zA-Z]/g) ?? []).length;
  return enChars > jaChars * 2 || (enChars > 30 && jaChars < 10);
}

async function searchVideos(
  pool: YouTubeApiKeyPool,
  opts: {
    channelId?: string;
    query?: string;
    publishedAfter: string;
    maxResults: number;
    order?: "date" | "viewCount" | "relevance";
    relevanceLanguage?: string;
  }
): Promise<{ ids: string[]; error?: YouTubeSearchError; fromCache?: boolean }> {
  const cacheKey = buildSearchCacheKey(opts);
  const cached = getCachedSearchIds(cacheKey);
  if (cached) {
    return { ids: cached, fromCache: true };
  }

  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    order: opts.order ?? "relevance",
    maxResults: String(Math.min(opts.maxResults, 25)),
    publishedAfter: opts.publishedAfter,
  });

  if (opts.relevanceLanguage) {
    params.set("relevanceLanguage", opts.relevanceLanguage);
  }
  if (opts.channelId) params.set("channelId", opts.channelId);
  if (opts.query) params.set("q", opts.query);

  const fetched = await pool.fetch(
    (apiKey) =>
      `https://www.googleapis.com/youtube/v3/search?${params}&key=${apiKey}`
  );

  if (!fetched) {
    const stale = getCachedSearchIds(cacheKey, { allowStale: true });
    if (stale) {
      return { ids: stale, fromCache: true };
    }
    return {
      ids: [],
      error: {
        query: opts.query,
        channelId: opts.channelId,
        status: 429,
        message: "All YouTube API keys exceeded search quota (429)",
      },
    };
  }

  const { response: res } = fetched;

  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const stale = getCachedSearchIds(cacheKey, { allowStale: res.status === 429 });
    if (stale) {
      return { ids: stale, fromCache: true };
    }
    return {
      ids: [],
      error: {
        query: opts.query,
        channelId: opts.channelId,
        status: res.status,
        message: json.error?.message ?? `YouTube search failed (${res.status})`,
      },
    };
  }

  const json = (await res.json()) as {
    items?: Array<{ id: { videoId?: string } }>;
  };
  const ids = (json.items ?? [])
    .map((i) => i.id.videoId)
    .filter((id): id is string => Boolean(id));

  if (ids.length) setCachedSearchIds(cacheKey, ids);
  return { ids };
}

async function fetchVideoDetails(
  pool: YouTubeApiKeyPool,
  videoIds: string[]
): Promise<
  Array<{
    videoId: string;
    title: string;
    channelTitle: string;
    channelId: string;
    description: string;
    publishedAt: string;
    viewCount: number;
  }>
> {
  if (!videoIds.length) return [];

  const results: Array<{
    videoId: string;
    title: string;
    channelTitle: string;
    channelId: string;
    description: string;
    publishedAt: string;
    viewCount: number;
  }> = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "snippet,statistics",
      id: chunk.join(","),
    });

    const fetched = await pool.fetch(
      (apiKey) =>
        `https://www.googleapis.com/youtube/v3/videos?${params}&key=${apiKey}`
    );
    if (!fetched || !fetched.response.ok) continue;

    const json = (await fetched.response.json()) as {
      items?: Array<{
        id: string;
        snippet: {
          title: string;
          channelTitle: string;
          channelId: string;
          description: string;
          publishedAt: string;
        };
        statistics?: { viewCount?: string };
      }>;
    };

    for (const item of json.items ?? []) {
      results.push({
        videoId: item.id,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        channelId: item.snippet.channelId,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        viewCount: parseInt(item.statistics?.viewCount ?? "0", 10) || 0,
      });
    }
  }

  return results;
}

async function fetchChannelSubscriberCounts(
  pool: YouTubeApiKeyPool,
  channelIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const unique = [...new Set(channelIds)];
  if (!unique.length) return map;

  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "statistics",
      id: chunk.join(","),
    });

    const fetched = await pool.fetch(
      (apiKey) =>
        `https://www.googleapis.com/youtube/v3/channels?${params}&key=${apiKey}`
    );
    if (!fetched || !fetched.response.ok) continue;

    const json = (await fetched.response.json()) as {
      items?: Array<{
        id: string;
        statistics?: {
          subscriberCount?: string;
          hiddenSubscriberCount?: boolean;
        };
      }>;
    };

    for (const item of json.items ?? []) {
      if (item.statistics?.hiddenSubscriberCount) continue;
      const subs = parseInt(item.statistics?.subscriberCount ?? "0", 10);
      if (subs > 0) map.set(item.id, subs);
    }
  }

  return map;
}

async function enrichWithTranscript(
  video: Omit<YouTubeVideo, "transcript" | "contentSource" | "url">
): Promise<YouTubeVideo> {
  const { text } = await fetchYouTubeTranscript(video.videoId);
  const hasTranscript = text.length > 50;
  return {
    ...video,
    transcript: text,
    contentSource: hasTranscript ? "transcript" : video.description ? "description" : "title_only",
    url: `https://www.youtube.com/watch?v=${video.videoId}`,
  };
}

export async function collectYouTubeVideos(
  options: YouTubeCollectOptions = {}
): Promise<YouTubeCollectResult> {
  const emptyDiagnostics = (): YouTubeCollectDiagnostics => ({
    searchCalls: 0,
    searchCacheHits: 0,
    searchErrors: [],
    candidateIds: 0,
    afterRelevanceFilter: 0,
    afterSpreadFilter: 0,
    quotaExceeded: false,
    apiKeyCount: 0,
    fallbackApiKeyUsed: false,
  });

  const apiKeys = loadYouTubeApiKeys();
  const pool = new YouTubeApiKeyPool(apiKeys);

  if (!pool.hasKeys()) {
    return {
      videos: [],
      diagnostics: {
        ...emptyDiagnostics(),
        searchErrors: [
          {
            status: 0,
            message: "YOUTUBE_API_KEY が .env に設定されていません",
          },
        ],
      },
    };
  }

  const diagnostics = emptyDiagnostics();
  diagnostics.apiKeyCount = pool.keyCount;

  const maxAgeHours = options.maxAgeHours ?? 24 * 180;
  const maxVideos = options.maxVideos ?? 10;
  const minSpreadRate = options.minSpreadRate ?? MIN_SPREAD_RATE_DEFAULT;
  const publishedAfter = publishedAfterIso(maxAgeHours);

  const jaQueries = (options.searchQueriesJa?.length
    ? options.searchQueriesJa
    : DEFAULT_QUERIES_JA
  ).slice(0, 6);
  const enQueries = (options.searchQueriesEn?.length
    ? options.searchQueriesEn
    : DEFAULT_QUERIES_EN
  ).slice(0, 5);

  const watchedSet = new Set(
    (options.watchedChannels ?? [])
      .filter((c) => c.enabled)
      .map((c) => c.channelId)
  );

  const idMeta = new Map<
    string,
    { fromWatchedChannel: boolean; priority: number; isEnSearch: boolean }
  >();

  const enabledWatched = (options.watchedChannels ?? [])
    .filter((c) => c.enabled)
    .sort((a, b) => a.priority - b.priority);

  const recordSearch = (result: Awaited<ReturnType<typeof searchVideos>>) => {
    if (result.fromCache) {
      diagnostics.searchCacheHits++;
    } else {
      diagnostics.searchCalls++;
    }
    if (result.error) {
      diagnostics.searchErrors.push(result.error);
      if (result.error.status === 429) diagnostics.quotaExceeded = true;
    }
  };

  for (const ch of enabledWatched) {
    const result = await searchVideos(pool, {
      channelId: ch.channelId,
      publishedAfter,
      maxResults: 15,
      order: "date",
    });
    recordSearch(result);
    for (const id of result.ids) {
      if (!idMeta.has(id)) {
        idMeta.set(id, { fromWatchedChannel: true, priority: ch.priority, isEnSearch: false });
      }
    }
  }

  for (const query of jaQueries) {
    const result = await searchVideos(pool, {
      query,
      publishedAfter,
      maxResults: 25,
      order: "viewCount",
      relevanceLanguage: "ja",
    });
    recordSearch(result);
    for (const id of result.ids) {
      if (!idMeta.has(id)) {
        idMeta.set(id, { fromWatchedChannel: false, priority: 50, isEnSearch: false });
      }
    }
  }

  for (const query of enQueries) {
    const result = await searchVideos(pool, {
      query,
      publishedAfter,
      maxResults: 25,
      order: "viewCount",
    });
    recordSearch(result);
    for (const id of result.ids) {
      if (!idMeta.has(id)) {
        idMeta.set(id, { fromWatchedChannel: false, priority: 60, isEnSearch: true });
      }
    }
  }

  diagnostics.fallbackApiKeyUsed = pool.fallbackUsed;
  if (pool.allExhausted()) {
    diagnostics.quotaExceeded = true;
  }

  const MAX_CANDIDATES = 160;
  const EN_CANDIDATE_QUOTA = 60;

  const watchedIds = [...idMeta.entries()]
    .filter(([, m]) => m.fromWatchedChannel)
    .sort((a, b) => a[1].priority - b[1].priority)
    .map(([id]) => id);

  const jaIds = [...idMeta.entries()]
    .filter(([, m]) => !m.fromWatchedChannel && !m.isEnSearch)
    .map(([id]) => id);

  const enIds = [...idMeta.entries()]
    .filter(([, m]) => m.isEnSearch)
    .map(([id]) => id);

  const used = new Set<string>();
  const sortedIds: string[] = [];
  const addIds = (ids: string[], maxCount?: number) => {
    let added = 0;
    for (const id of ids) {
      if (sortedIds.length >= MAX_CANDIDATES) break;
      if (maxCount !== undefined && added >= maxCount) break;
      if (used.has(id)) continue;
      used.add(id);
      sortedIds.push(id);
      added++;
    }
  };

  addIds(watchedIds);
  addIds(enIds, EN_CANDIDATE_QUOTA);
  addIds(jaIds);
  addIds(enIds);

  const relevanceTerms = options.relevanceTerms ?? [];
  diagnostics.candidateIds = sortedIds.length;

  const details = await fetchVideoDetails(pool, sortedIds);
  const freshDetails = details.filter(
    (d) =>
      isWithinMaxAge(d.publishedAt, maxAgeHours) &&
      !isShortVideo(d.title, d.description) &&
      isTitleRelevantToCoin(d.title, relevanceTerms) &&
      isRelevantToCoin(d.title, d.description, relevanceTerms)
  );
  diagnostics.afterRelevanceFilter = freshDetails.length;

  const channelIds = freshDetails.map((d) => d.channelId);
  const subscriberMap = await fetchChannelSubscriberCounts(pool, channelIds);

  type Scored = Omit<YouTubeVideo, "transcript" | "contentSource" | "url"> & {
    score: number;
  };

  const scored: Scored[] = [];
  for (const d of freshDetails) {
    const subs = subscriberMap.get(d.channelId) ?? 0;
    if (subs <= 0) continue;

    const spreadRate = d.viewCount / subs;
    if (spreadRate < minSpreadRate) continue;

    const meta = idMeta.get(d.videoId)!;
    const isInternational = detectInternational(d.title, d.description) || meta.isEnSearch;
    const intlBonus = isInternational ? 0.15 : 0;

    scored.push({
      videoId: d.videoId,
      title: d.title,
      channelTitle: d.channelTitle,
      channelId: d.channelId,
      description: d.description.slice(0, 2000),
      publishedAt: d.publishedAt,
      fromWatchedChannel:
        meta.fromWatchedChannel || watchedSet.has(d.channelId),
      viewCount: d.viewCount,
      subscriberCount: subs,
      spreadRate,
      isInternational,
      score: spreadRate + intlBonus,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  diagnostics.afterSpreadFilter = scored.length;

  const finalPicks = scored.slice(0, maxVideos);

  const videos: YouTubeVideo[] = [];
  for (const pick of finalPicks) {
    const { score: _s, ...base } = pick;
    videos.push(await enrichWithTranscript(base));
  }

  return { videos, diagnostics };
}
