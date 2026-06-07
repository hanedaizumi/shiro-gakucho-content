export interface YouTubeVideo {
  title: string;
  channelTitle: string;
  description: string;
  publishedAt: string;
  url: string;
}

const DEFAULT_QUERIES = [
  "ビットコイン チャート分析",
  "BTC technical analysis",
];

export async function collectYouTubeVideos(
  queries: string[] = DEFAULT_QUERIES,
  maxPerQuery = 5
): Promise<YouTubeVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  const results: YouTubeVideo[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        part: "snippet",
        q: query,
        type: "video",
        order: "date",
        maxResults: String(maxPerQuery),
        key: apiKey,
        relevanceLanguage: "ja",
      });

      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?${params}`,
        { next: { revalidate: 0 } }
      );
      if (!res.ok) continue;

      const json = (await res.json()) as {
        items: Array<{
          id: { videoId: string };
          snippet: {
            title: string;
            channelTitle: string;
            description: string;
            publishedAt: string;
          };
        }>;
      };

      for (const item of json.items ?? []) {
        const id = item.id.videoId;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        results.push({
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          description: item.snippet.description.slice(0, 300),
          publishedAt: item.snippet.publishedAt,
          url: `https://www.youtube.com/watch?v=${id}`,
        });
      }
    } catch {
      // skip
    }
  }

  return results.slice(0, 15);
}
