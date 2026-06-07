export interface WatchedYouTubeChannel {
  id: string;
  channelId: string;
  name: string;
  handle?: string;
  thumbnailUrl?: string;
  enabled: boolean;
  priority: number;
  addedAt: string;
}

export interface AppSettings {
  youtubeChannels: WatchedYouTubeChannel[];
  youtubeMaxAgeHours: number;
  youtubeSearchQueries: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  youtubeChannels: [],
  youtubeMaxAgeHours: 24,
  youtubeSearchQueries: [
    "ビットコイン チャート分析",
    "BTC technical analysis",
  ],
};
