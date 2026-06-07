"use client";

import { useState } from "react";

export function SyncHistoryButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/sync-history", { method: "POST" });
      const data = await res.json();
      setResult(data.synced !== undefined ? `${data.synced}件同期しました` : data.error);
    } catch {
      setResult("同期に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleSync}
        disabled={loading}
        className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--accent)] disabled:opacity-50"
      >
        {loading ? "同期中..." : "過去台本をDBに同期"}
      </button>
      {result && <p className="mt-2 text-sm text-[var(--muted)]">{result}</p>}
    </div>
  );
}
