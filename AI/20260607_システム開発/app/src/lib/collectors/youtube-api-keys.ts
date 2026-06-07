/** YouTube APIキーを優先順で読み込む（先頭＝メイン、以降＝フォールバック） */
export function loadYouTubeApiKeys(): string[] {
  const ordered: string[] = [];

  const primary = process.env.YOUTUBE_API_KEY?.trim();
  const fallback = process.env.YOUTUBE_API_KEY_FALLBACK?.trim();

  if (primary) ordered.push(primary);
  if (fallback) ordered.push(fallback);

  const extras =
    process.env.YOUTUBE_API_KEYS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  for (const key of extras) {
    if (!ordered.includes(key)) ordered.push(key);
  }

  return ordered;
}

export class YouTubeApiKeyPool {
  private readonly keys: string[];
  private readonly exhausted = new Set<string>();

  /** メインキーが429になりフォールバックへ切り替えたか */
  fallbackUsed = false;

  constructor(keys?: string[]) {
    this.keys = keys ?? loadYouTubeApiKeys();
  }

  hasKeys(): boolean {
    return this.keys.length > 0;
  }

  get keyCount(): number {
    return this.keys.length;
  }

  private availableKeys(): string[] {
    return this.keys.filter((k) => !this.exhausted.has(k));
  }

  markQuotaExceeded(apiKey: string): void {
    const wasPrimary = this.keys[0] === apiKey;
    this.exhausted.add(apiKey);
    if (wasPrimary && this.keys.length > 1) {
      this.fallbackUsed = true;
    }
  }

  allExhausted(): boolean {
    return this.availableKeys().length === 0;
  }

  /** 429時は次のキーで自動リトライ */
  async fetch(buildUrl: (apiKey: string) => string): Promise<{
    response: Response;
    apiKey: string;
  } | null> {
    for (const apiKey of this.availableKeys()) {
      const response = await fetch(buildUrl(apiKey), { next: { revalidate: 0 } });
      if (response.status === 429) {
        this.markQuotaExceeded(apiKey);
        continue;
      }
      return { response, apiKey };
    }
    return null;
  }
}
