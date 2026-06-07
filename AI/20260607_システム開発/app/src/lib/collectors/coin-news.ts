import Parser from "rss-parser";
import type { NewsItem } from "./news-rss";
import {
  extractPlanningKeywords,
  scorePlanningRelevance,
  type PlanningContext,
} from "@/lib/planning/context";

const RSS_FEEDS = [
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
];

const parser = new Parser({ timeout: 12000 });

function isRelevant(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function newsPriority(pubDate: number, now: number): number {
  const ageDays = (now - pubDate) / (24 * 60 * 60 * 1000);
  if (ageDays <= 30) return 3;
  if (ageDays <= 90) return 2;
  return 0;
}

async function fetchGoogleNews(
  queries: string[],
  maxAgeDays: number,
  coinKeywords: string[]
): Promise<NewsItem[]> {
  const items: NewsItem[] = [];
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const uniqueQueries = [...new Set(queries)].slice(0, 6);

  for (const q of uniqueQueries) {
    const query = encodeURIComponent(q);
    const url = `https://news.google.com/rss/search?q=${query}&hl=ja&gl=JP&ceid=JP:ja`;

    try {
      const parsed = await parser.parseURL(url);
      for (const entry of parsed.items.slice(0, 20)) {
        const title = entry.title ?? "";
        const summary = entry.contentSnippet ?? entry.content ?? "";
        const pubDate = entry.pubDate ? new Date(entry.pubDate).getTime() : Date.now();
        if (pubDate < cutoff) continue;
        if (!isRelevant(`${title} ${summary}`, coinKeywords)) continue;

        items.push({
          source: "Google News",
          title,
          url: entry.link ?? "",
          summary: summary.slice(0, 800),
          publishedAt: new Date(pubDate).toISOString(),
        });
      }
    } catch {
      // skip
    }
  }

  return items;
}

export async function collectCoinNews(
  keywords: string[],
  options?: {
    maxItems?: number;
    maxAgeDays?: number;
    planning?: PlanningContext;
  }
): Promise<NewsItem[]> {
  const maxItems = options?.maxItems ?? 40;
  const maxAgeDays = options?.maxAgeDays ?? 90;
  const planning = options?.planning;
  const planningKeywords = planning ? extractPlanningKeywords(planning) : [];
  const allKeywords = [...keywords, ...planningKeywords];

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const items: NewsItem[] = [];

  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const entry of parsed.items.slice(0, 50)) {
        const title = entry.title ?? "";
        const summary = entry.contentSnippet ?? entry.content ?? "";
        if (!isRelevant(`${title} ${summary}`, keywords)) continue;

        const pubDate = entry.pubDate ? new Date(entry.pubDate).getTime() : Date.now();
        if (pubDate < cutoff) continue;

        items.push({
          source: feed.name,
          title,
          url: entry.link ?? "",
          summary: summary.slice(0, 800),
          publishedAt: new Date(pubDate).toISOString(),
        });
      }
    } catch {
      // skip
    }
  }

  const googleQueries = [
    `${keywords[0]} crypto`,
    `${keywords[0]} 仮想通貨`,
    ...planningKeywords.slice(0, 4).map((k) => `${keywords[0]} ${k}`),
  ];
  const google = await fetchGoogleNews(googleQueries, maxAgeDays, keywords);
  items.push(...google);

  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = item.title.slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({
      item,
      freshness: newsPriority(new Date(item.publishedAt).getTime(), now),
      planningScore: scorePlanningRelevance(
        `${item.title} ${item.summary}`,
        planningKeywords
      ),
    }))
    .sort((a, b) => {
      const planDiff = b.planningScore - a.planningScore;
      if (planDiff !== 0) return planDiff;
      const freshDiff = b.freshness - a.freshness;
      if (freshDiff !== 0) return freshDiff;
      return (
        new Date(b.item.publishedAt).getTime() -
        new Date(a.item.publishedAt).getTime()
      );
    })
    .slice(0, maxItems)
    .map((x) => x.item);
}
