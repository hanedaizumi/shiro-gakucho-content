import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

const CACHE_FILE = join(process.cwd(), "data", "youtube-search-cache.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  ids: string[];
  savedAt: string;
}

type CacheStore = Record<string, CacheEntry>;

function loadStore(): CacheStore {
  try {
    if (!existsSync(CACHE_FILE)) return {};
    return JSON.parse(readFileSync(CACHE_FILE, "utf8")) as CacheStore;
  } catch {
    return {};
  }
}

function saveStore(store: CacheStore): void {
  const dir = dirname(CACHE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(store, null, 2), "utf8");
}

export function buildSearchCacheKey(opts: {
  channelId?: string;
  query?: string;
  publishedAfter: string;
  order?: string;
  relevanceLanguage?: string;
}): string {
  return JSON.stringify({
    channelId: opts.channelId ?? "",
    query: opts.query ?? "",
    publishedAfter: opts.publishedAfter,
    order: opts.order ?? "relevance",
    relevanceLanguage: opts.relevanceLanguage ?? "",
  });
}

export function getCachedSearchIds(
  key: string,
  opts?: { allowStale?: boolean }
): string[] | null {
  const store = loadStore();
  const entry = store[key];
  if (!entry) return null;
  const expired = Date.now() - new Date(entry.savedAt).getTime() > CACHE_TTL_MS;
  if (expired && !opts?.allowStale) return null;
  return entry.ids;
}

export function setCachedSearchIds(key: string, ids: string[]): void {
  const store = loadStore();
  store[key] = { ids, savedAt: new Date().toISOString() };
  saveStore(store);
}
