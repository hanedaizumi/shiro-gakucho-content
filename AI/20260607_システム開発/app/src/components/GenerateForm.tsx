"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [manualXPosts, setManualXPosts] = useState("");
  const [scriptNumber, setScriptNumber] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manualXPosts: manualXPosts || undefined,
          scriptNumber: scriptNumber ? parseInt(scriptNumber, 10) : undefined,
        }),
      });

      const data = await res.json();
      if (data.jobId) {
        router.push(`/jobs/${data.jobId}`);
      }
    } catch {
      alert("生成の開始に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-[var(--muted)] mb-1">
          台本番号（空欄で自動）
        </label>
        <input
          type="number"
          value={scriptNumber}
          onChange={(e) => setScriptNumber(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm"
          placeholder="例: 6"
        />
      </div>

      <div>
        <label className="block text-sm text-[var(--muted)] mb-1">
          X投稿（手動ペースト・1行1投稿）
        </label>
        <textarea
          value={manualXPosts}
          onChange={(e) => setManualXPosts(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm"
          placeholder="X API未設定時はここに市況関連ポストを貼り付け"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[var(--accent)] px-6 py-3 font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "開始中..." : "今日のBTC分析を生成"}
      </button>
    </form>
  );
}
