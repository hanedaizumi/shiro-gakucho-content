import { YouTubeApiKeyPool } from "./youtube-api-keys";

export interface ResolvedChannel {
  channelId: string;
  name: string;
  handle?: string;
  thumbnailUrl?: string;
}

function parseChannelInput(input: string): {
  channelId?: string;
  handle?: string;
  username?: string;
} {
  const trimmed = input.trim();

  const idMatch = trimmed.match(/(?:youtube\.com\/channel\/)(UC[\w-]{22})/i);
  if (idMatch) return { channelId: idMatch[1] };

  const handleMatch = trimmed.match(/(?:youtube\.com\/@)([\w.-]+)/i);
  if (handleMatch) return { handle: handleMatch[1] };

  if (trimmed.startsWith("@")) return { handle: trimmed.slice(1) };
  if (/^UC[\w-]{22}$/.test(trimmed)) return { channelId: trimmed };

  const userMatch = trimmed.match(/(?:youtube\.com\/user\/)([\w.-]+)/i);
  if (userMatch) return { username: userMatch[1] };

  return { handle: trimmed.replace(/^@/, "") };
}

export async function resolveYouTubeChannel(
  input: string
): Promise<ResolvedChannel | null> {
  const pool = new YouTubeApiKeyPool();
  if (!pool.hasKeys()) return null;

  const parsed = parseChannelInput(input);
  const params = new URLSearchParams({
    part: "snippet",
  });

  if (parsed.channelId) {
    params.set("id", parsed.channelId);
  } else if (parsed.handle) {
    params.set("forHandle", parsed.handle);
  } else if (parsed.username) {
    params.set("forUsername", parsed.username);
  } else {
    return null;
  }

  const fetched = await pool.fetch(
    (apiKey) =>
      `https://www.googleapis.com/youtube/v3/channels?${params}&key=${apiKey}`
  );
  if (!fetched || !fetched.response.ok) return null;
  const res = fetched.response;

  const json = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet: {
        title: string;
        customUrl?: string;
        thumbnails?: { default?: { url: string } };
      };
    }>;
  };

  const item = json.items?.[0];
  if (!item) return null;

  return {
    channelId: item.id,
    name: item.snippet.title,
    handle: item.snippet.customUrl,
    thumbnailUrl: item.snippet.thumbnails?.default?.url,
  };
}
