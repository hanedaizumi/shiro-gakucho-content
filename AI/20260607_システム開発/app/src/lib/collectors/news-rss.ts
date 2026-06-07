import Parser from "rss-parser";

const RSS_FEEDS = [
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
];

const BTC_KEYWORDS = [
  "bitcoin",
  "btc",
  "ビットコイン",
  "crypto",
  "cryptocurrency",
];

export interface NewsItem {
  source: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: string;
}

const parser = new Parser({ timeout: 10000 });

function isBtcRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return BTC_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function collectNewsRss(maxItems = 10): Promise<NewsItem[]> {
  const items: NewsItem[] = [];
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;

  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const entry of parsed.items.slice(0, 20)) {
        const title = entry.title ?? "";
        const summary = entry.contentSnippet ?? entry.content ?? "";
        if (!isBtcRelated(`${title} ${summary}`)) continue;

        const pubDate = entry.pubDate ? new Date(entry.pubDate).getTime() : Date.now();
        if (pubDate < cutoff) continue;

        items.push({
          source: feed.name,
          title,
          url: entry.link ?? "",
          summary: summary.slice(0, 500),
          publishedAt: new Date(pubDate).toISOString(),
        });
      }
    } catch {
      // skip failed feed
    }
  }

  return items
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, maxItems);
}
