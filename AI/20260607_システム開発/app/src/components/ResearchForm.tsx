"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ResearchMode = "fundamentals" | "technical" | "both";
type OutputMode = "report" | "script" | "report_and_script";

const RESEARCH_OPTIONS: { value: ResearchMode; label: string; description: string }[] = [
  { value: "fundamentals", label: "ファンダメンタルズ", description: "ニュース・時事 ＋ 競合YouTube台本" },
  { value: "technical", label: "テクニカル", description: "チャート分析・重要ライン・シナリオ" },
  { value: "both", label: "両方", description: "ファンダ ＋ テクニカル" },
];

const OUTPUT_OPTIONS: { value: OutputMode; label: string; description: string }[] = [
  { value: "report", label: "レポート", description: "ニュース・競合リサーチレポート" },
  { value: "script", label: "台本", description: "YouTube台本のみ出力" },
  { value: "report_and_script", label: "レポート＆台本", description: "両方を出力" },
];

export default function ResearchForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [coinInput, setCoinInput] = useState("ビットコイン BTC");
  const [thumbnailText, setThumbnailText] = useState("");
  const [titleText, setTitleText] = useState("");
  const [storyHypothesis, setStoryHypothesis] = useState("");
  const [researchMode, setResearchMode] = useState<ResearchMode>("both");
  const [outputMode, setOutputMode] = useState<OutputMode>("report_and_script");
  const [scriptNumber, setScriptNumber] = useState("");

  const showScriptNumber =
    outputMode === "script" || outputMode === "report_and_script";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coinInput.trim()) {
      alert("コイン名を入力してください（例: ビットコイン BTC）");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coinInput: coinInput.trim(),
          thumbnailText: thumbnailText.trim(),
          titleText: titleText.trim(),
          storyHypothesis: storyHypothesis.trim(),
          researchMode,
          outputMode,
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
      }
    } catch (err) {
      alert(`生成の開始に失敗しました: ${err instanceof Error ? err.message : "不明なエラー"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="mb-1 block text-sm text-[var(--muted)]">① コイン名</label>
        <input
          type="text"
          value={coinInput}
          onChange={(e) => setCoinInput(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm"
          placeholder="例: ビットコイン BTC / リップル XRP"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-[var(--muted)]">② サムネ文言</label>
        <input
          type="text"
          value={thumbnailText}
          onChange={(e) => setThumbnailText(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm"
          placeholder="例: ゴールドマン240億売却　XRP保有者が見落とす　ヤバい真実"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          リサーチ・台本の軸になります。ニュース選定と競合分析に反映されます
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm text-[var(--muted)]">③ タイトル</label>
        <input
          type="text"
          value={titleText}
          onChange={(e) => setTitleText(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm"
          placeholder="例: 【2026年最新】99%が知らないリップル(XRP)爆上げの新事実｜法案・ETF・送金需要"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-[var(--muted)]">
          ④ 台本の方向性・仮説
          <span className="ml-1 text-xs opacity-60">（任意）</span>
        </label>
        <textarea
          value={storyHypothesis}
          onChange={(e) => setStoryHypothesis(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm resize-none"
          placeholder="例: ゴールドマンの売却を「逃げ」ではなく在庫調整と解釈し、ETF流入＋CLARITY法案で中長期の買い場を提示するストーリーにしたい"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          入力するとAIがニュースの関連度を意味レベルで判定します。未入力でも動作します
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm text-[var(--muted)]">⑤ リサーチ種別</label>
        <div className="space-y-2">
          {RESEARCH_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
                researchMode === opt.value
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] hover:border-[var(--accent)]/50"
              }`}
            >
              <input
                type="radio"
                name="researchMode"
                value={opt.value}
                checked={researchMode === opt.value}
                onChange={() => setResearchMode(opt.value)}
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

      <div>
        <label className="mb-2 block text-sm text-[var(--muted)]">⑥ 出力形式</label>
        <div className="space-y-2">
          {OUTPUT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
                outputMode === opt.value
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] hover:border-[var(--accent)]/50"
              }`}
            >
              <input
                type="radio"
                name="outputMode"
                value={opt.value}
                checked={outputMode === opt.value}
                onChange={() => setOutputMode(opt.value)}
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

      {showScriptNumber && (
        <div>
          <label className="mb-1 block text-sm text-[var(--muted)]">
            台本番号（空欄で自動・BTCテクニカル台本向け）
          </label>
          <input
            type="number"
            value={scriptNumber}
            onChange={(e) => setScriptNumber(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm"
            placeholder="例: 8"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[var(--accent)] px-6 py-3 font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "生成中..." : "生成を開始"}
      </button>
    </form>
  );
}
