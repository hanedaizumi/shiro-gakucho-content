"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [scriptNumber, setScriptNumber] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptNumber: scriptNumber ? parseInt(scriptNumber, 10) : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`生成の開始に失敗しました: ${data.error ?? `HTTP ${res.status}`}`);
        return;
      }
      if (data.jobId) {
        router.push(`/jobs/${data.jobId}`);
      } else {
        alert("生成の開始に失敗しました: ジョブIDが返されませんでした");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "不明なエラー";
      alert(`生成の開始に失敗しました: ${msg}`);
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
