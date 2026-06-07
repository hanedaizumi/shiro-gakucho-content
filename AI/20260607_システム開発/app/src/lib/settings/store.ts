import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import type { AppSettings, WatchedYouTubeChannel } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const SETTINGS_FILE = path.join(process.cwd(), "data", "settings.json");

function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      youtubeChannels: parsed.youtubeChannels ?? [],
      youtubeSearchQueries:
        parsed.youtubeSearchQueries?.length
          ? parsed.youtubeSearchQueries
          : DEFAULT_SETTINGS.youtubeSearchQueries,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  await mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
  return settings;
}

export async function addYouTubeChannel(
  channel: Omit<WatchedYouTubeChannel, "id" | "addedAt" | "priority" | "enabled"> & {
    priority?: number;
    enabled?: boolean;
  }
): Promise<AppSettings> {
  const settings = await loadSettings();
  const exists = settings.youtubeChannels.some(
    (c) => c.channelId === channel.channelId
  );
  if (exists) {
    throw new Error("このチャンネルは既に登録されています");
  }

  const maxPriority = settings.youtubeChannels.reduce(
    (m, c) => Math.max(m, c.priority),
    0
  );

  settings.youtubeChannels.push({
    id: cuid(),
    channelId: channel.channelId,
    name: channel.name,
    handle: channel.handle,
    thumbnailUrl: channel.thumbnailUrl,
    enabled: channel.enabled ?? true,
    priority: channel.priority ?? maxPriority + 1,
    addedAt: new Date().toISOString(),
  });

  settings.youtubeChannels.sort((a, b) => a.priority - b.priority);
  return saveSettings(settings);
}

export async function removeYouTubeChannel(id: string): Promise<AppSettings> {
  const settings = await loadSettings();
  settings.youtubeChannels = settings.youtubeChannels.filter((c) => c.id !== id);
  return saveSettings(settings);
}

export async function updateYouTubeChannel(
  id: string,
  patch: Partial<Pick<WatchedYouTubeChannel, "enabled" | "priority" | "name">>
): Promise<AppSettings> {
  const settings = await loadSettings();
  const idx = settings.youtubeChannels.findIndex((c) => c.id === id);
  if (idx < 0) throw new Error("チャンネルが見つかりません");
  settings.youtubeChannels[idx] = { ...settings.youtubeChannels[idx], ...patch };
  settings.youtubeChannels.sort((a, b) => a.priority - b.priority);
  return saveSettings(settings);
}

export async function updateSettings(
  patch: Partial<Pick<AppSettings, "youtubeMaxAgeHours" | "youtubeSearchQueries">>
): Promise<AppSettings> {
  const settings = await loadSettings();
  return saveSettings({ ...settings, ...patch });
}
