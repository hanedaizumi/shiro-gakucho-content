const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
}

function decodeTranscriptXml(xml: string): string {
  const lines: string[] = [];
  const regex = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const text = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n/g, " ")
      .trim();
    if (text) lines.push(text);
  }
  return lines.join(" ");
}

async function getCaptionTracks(videoId: string): Promise<CaptionTrack[]> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { "User-Agent": UA, "Accept-Language": "ja,en" },
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];

  const html = await res.text();
  const match = html.match(/"captionTracks":(\[.*?\])/);
  if (!match) return [];

  try {
    const tracks = JSON.parse(match[1]) as Array<{
      baseUrl: string;
      languageCode: string;
    }>;
    return tracks.map((t) => ({
      baseUrl: t.baseUrl,
      languageCode: t.languageCode,
    }));
  } catch {
    return [];
  }
}

export async function fetchYouTubeTranscript(
  videoId: string,
  maxChars = 8000
): Promise<{ text: string; source: "transcript" | "none" }> {
  try {
    const tracks = await getCaptionTracks(videoId);
    if (!tracks.length) return { text: "", source: "none" };

    const preferred =
      tracks.find((t) => t.languageCode === "ja") ??
      tracks.find((t) => t.languageCode.startsWith("ja")) ??
      tracks.find((t) => t.languageCode === "en") ??
      tracks[0];

    const capRes = await fetch(preferred.baseUrl, {
      headers: { "User-Agent": UA },
      next: { revalidate: 0 },
    });
    if (!capRes.ok) return { text: "", source: "none" };

    const xml = await capRes.text();
    const text = decodeTranscriptXml(xml).slice(0, maxChars);
    return { text, source: text ? "transcript" : "none" };
  } catch {
    return { text: "", source: "none" };
  }
}
