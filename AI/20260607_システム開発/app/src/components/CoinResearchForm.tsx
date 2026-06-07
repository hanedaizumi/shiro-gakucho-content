"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ResearchMode = "fundamentals" | "technical" | "both";

const MODE_OPTIONS: { value: ResearchMode; label: string; description: string }[] = [
  {
    value: "fundamentals",
    label: "ファンダメンタルズ",
    description: "ニュース・時事 ＋ 競合YouTube台本",
  },
  {
    value: "technical",
    label: "テクニカル",
    description: "チャート分析・重要ライン・シナリオ",
  },
  {
    value: "both",
    label: "両方",
    description: "ファンダ ＋ テクニカルの統合レポート",
  },
];

export default function CoinResearchForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [coinInput, setCoinInput] = useState("");
  const [mode, setMode] = useState<ResearchMode>("both");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coinInput.trim()) {
      alert("コイン名を入力してください（例: ビットコイン BTC）");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/coin-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coinInput: coinInput.trim(), mode }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`リサーチの開始に失敗しました: ${data.error ?? `HTTP ${res.status}`}`);
        return;
      }
      if (data.jobId) {
        router.push(`/jobs/${data.jobId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "不明なエラー";
      alert(`リサーチの開始に失敗しました: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm text-[var(--muted)]">
          コイン名
        </label>
        <input
          type="text"
          value={coinInput}
          onChange={(e) => setCoinInput(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm"
          placeholder="例: ビットコイン BTC / リップル XRP"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          日本語名・英語名・ティッカー（BTC, XRP等）に対応
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm text-[var(--muted)]">
          リサーチ種別
        </label>
        <div className="space-y-2">
          {MODE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
                mode === opt.value
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] hover:border-[var(--accent)]/50"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={opt.value}
                checked={mode === opt.value}
                onChange={() => setMode(opt.value)}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-[var(--muted)]">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg border border-[var(--accent)] bg-transparent px-6 py-3 font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/10 disabled:opacity-50"
      >
        {loading ? "リサーチ開始中..." : "コインリサーチを開始"}
      </button>
    </form>
  );
}
