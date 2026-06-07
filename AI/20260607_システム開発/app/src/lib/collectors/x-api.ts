export interface XPost {
  text: string;
  author: string;
  createdAt: string;
  url?: string;
}

export async function collectXPosts(
  manualPosts?: string | null
): Promise<XPost[]> {
  const bearer = process.env.X_API_BEARER_TOKEN;
  const manual = manualPosts ?? process.env.MANUAL_X_POSTS ?? "";

  const results: XPost[] = [];

  if (manual.trim()) {
    for (const line of manual.split("\n").filter(Boolean)) {
      results.push({
        text: line.trim(),
        author: "manual",
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (!bearer) return results;

  const query = "bitcoin OR BTC lang:ja -is:retweet";
  try {
    const params = new URLSearchParams({
      query,
      max_results: "10",
      "tweet.fields": "created_at,author_id",
      expansions: "author_id",
      "user.fields": "username",
    });

    const res = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?${params}`,
      {
        headers: { Authorization: `Bearer ${bearer}` },
        next: { revalidate: 0 },
      }
    );
    if (!res.ok) return results;

    const json = (await res.json()) as {
      data?: Array<{ id: string; text: string; created_at: string; author_id: string }>;
      includes?: { users?: Array<{ id: string; username: string }> };
    };

    const users = new Map(
      (json.includes?.users ?? []).map((u) => [u.id, u.username])
    );

    for (const tweet of json.data ?? []) {
      results.push({
        text: tweet.text,
        author: users.get(tweet.author_id) ?? tweet.author_id,
        createdAt: tweet.created_at,
        url: `https://x.com/i/web/status/${tweet.id}`,
      });
    }
  } catch {
    // fallback to manual only
  }

  return results;
}
