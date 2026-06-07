"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppSettings } from "@/lib/settings/types";

export function YouTubeChannelSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/settings");
    if (res.ok) setSettings(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addChannel() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_channel", input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "追加に失敗しました");
      setSettings(data);
      setInput("");
      setMessage("チャンネルを追加しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラー");
    } finally {
      setLoading(false);
    }
  }

  async function removeChannel(id: string) {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove_channel", id }),
    });
    if (res.ok) setSettings(await res.json());
  }

  async function toggleChannel(id: string, enabled: boolean) {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_channel", id, enabled }),
    });
    if (res.ok) setSettings(await res.json());
  }

  if (!settings) {
    return <p className="text-sm text-[var(--muted)]">読み込み中...</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        登録チャンネルの動画を<strong>24時間以内</strong>のものだけ優先取得します。
        字幕があれば内容を読み取り、レポート§7に分析として組み込みます。
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://www.youtube.com/@channel または UC..."
          className="flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={addChannel}
          disabled={loading || !input.trim()}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          追加
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {message && <p className="text-sm text-green-400">{message}</p>}

      {settings.youtubeChannels.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          ウォッチチャンネル未登録。キーワード検索のみで動画を取得します。
        </p>
      ) : (
        <ul className="space-y-2">
          {settings.youtubeChannels.map((ch) => (
            <li
              key={ch.id}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2"
            >
              <div className="flex items-center gap-3">
                {ch.thumbnailUrl && (
                  <img
                    src={ch.thumbnailUrl}
                    alt=""
                    className="h-8 w-8 rounded-full"
                  />
                )}
                <div>
                  <p className="text-sm font-medium">{ch.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {ch.handle ? `@${ch.handle.replace(/^@/, "")}` : ch.channelId}
                    {ch.enabled ? " · 有効" : " · 無効"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggleChannel(ch.id, !ch.enabled)}
                  className="text-xs text-[var(--accent)]"
                >
                  {ch.enabled ? "無効化" : "有効化"}
                </button>
                <button
                  type="button"
                  onClick={() => removeChannel(ch.id)}
                  className="text-xs text-red-400"
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-[var(--muted)]">
        鮮度フィルタ: 過去 {settings.youtubeMaxAgeHours} 時間以内の動画のみ参照
      </p>
    </div>
  );
}
