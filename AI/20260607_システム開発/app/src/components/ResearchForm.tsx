"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ResearchMode = "fundamentals" | "technical" | "both";
type TradingBias = "bullish" | "bearish" | "neutral";

const TRADING_BIAS_OPTIONS: { value: TradingBias; label: string; emoji: string }[] = [
  { value: "bullish", label: "上昇優先", emoji: "📈" },
  { value: "neutral", label: "中立", emoji: "➡️" },
  { value: "bearish", label: "下落優先", emoji: "📉" },
];

const RESEARCH_OPTIONS: { value: ResearchMode; label: string; description: string }[] = [
  { value: "fundamentals", label: "ファンダメンタルズ", description: "ニュース・時事 ＋ 競合YouTube台本" },
  { value: "technical", label: "テクニカル", description: "チャート分析・重要ライン・シナリオ" },
  { value: "both", label: "両方", description: "ファンダ ＋ テクニカル" },
];

const FORM_STORAGE_KEY = "research-form-draft-v1";

interface FormDraft {
  coinInput: string;
  thumbnailText: string;
  titleText: string;
  storyHypothesis: string;
  tradingBias: TradingBias;
  researchMode: ResearchMode;
  scriptNumber: string;
  previousScriptText: string;
}

export default function ResearchForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [restored, setRestored] = useState(false);
  const [coinInput, setCoinInput] = useState("ビットコイン BTC");
  const [thumbnailText, setThumbnailText] = useState("");
  const [titleText, setTitleText] = useState("");
  const [storyHypothesis, setStoryHypothesis] = useState("");
  const [tradingBias, setTradingBias] = useState<TradingBias>("neutral");
  const [researchMode, setResearchMode] = useState<ResearchMode>("both");
  const [scriptNumber, setScriptNumber] = useState("");
  const [previousScriptText, setPreviousScriptText] = useState("");

  // 入力値の復元（戻るボタンで消えないように）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FORM_STORAGE_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<FormDraft>;
        if (draft.coinInput) setCoinInput(draft.coinInput);
        if (draft.thumbnailText) setThumbnailText(draft.thumbnailText);
        if (draft.titleText) setTitleText(draft.titleText);
        if (draft.storyHypothesis) setStoryHypothesis(draft.storyHypothesis);
        if (draft.tradingBias) setTradingBias(draft.tradingBias);
        if (draft.researchMode) setResearchMode(draft.researchMode);
        if (draft.scriptNumber) setScriptNumber(draft.scriptNumber);
        if (draft.previousScriptText) setPreviousScriptText(draft.previousScriptText);
      }
    } catch {
      // 破損したドラフトは無視
    }
    setRestored(true);
  }, []);

  // 入力値の自動保存
  useEffect(() => {
    if (!restored) return;
    const draft: FormDraft = {
      coinInput,
      thumbnailText,
      titleText,
      storyHypothesis,
      tradingBias,
      researchMode,
      scriptNumber,
      previousScriptText,
    };
    try {
      localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // 容量超過などは無視
    }
  }, [restored, coinInput, thumbnailText, titleText, storyHypothesis, tradingBias, researchMode, scriptNumber, previousScriptText]);

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
          tradingBias,
          researchMode,
          scriptNumber: scriptNumber ? parseInt(scriptNumber, 10) : undefined,
          previousScriptText: previousScriptText.trim() || undefined,
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
          placeholder="例: BTC崩壊　/　52000ドルまでの下落警戒"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          リサーチ・レポートの軸になります。ニュース選定と競合分析に反映されます
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm text-[var(--muted)]">③ タイトル</label>
        <input
          type="text"
          value={titleText}
          onChange={(e) => setTitleText(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm"
          placeholder="例: 【⚠️警告】61,500ドルの重要サポート崩壊！億トレーダーが見据える52,000ドルまでの下落シナリオ【BTC】"
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
          placeholder="例: 61,500ドル割れで下落優勢としつつ、売られすぎ指標から短期反発の可能性も提示するストーリーにしたい"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          入力するとAIがニュースの関連度を意味レベルで判定します。未入力でも動作します
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm text-[var(--muted)]">
          ⑤ テクニカルバイアス
          <span className="ml-1 text-xs opacity-60">（テクニカル分析の方向感・任意）</span>
        </label>
        <div className="flex gap-2">
          {TRADING_BIAS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTradingBias(opt.value)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                tradingBias === opt.value
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 font-semibold"
                  : "border-[var(--border)] hover:border-[var(--accent)]/50"
              }`}
            >
              {opt.emoji} {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          客観的なデータを踏まえつつ、このバイアス方向を優先してシナリオ・レポートを構成します
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm text-[var(--muted)]">⑥ リサーチ種別</label>
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
        <label className="mb-1 block text-sm text-[var(--muted)]">
          ⑦ 今回の台本番号
          <span className="ml-1 text-xs opacity-60">（任意・前回振り返りの番号表記に使用）</span>
        </label>
        <input
          type="number"
          value={scriptNumber}
          onChange={(e) => setScriptNumber(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm"
          placeholder="例: 9"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-[var(--muted)]">
          ⑧ 前回の台本（本文貼り付け）
          <span className="ml-1 text-xs opacity-60">（任意）</span>
        </label>
        <textarea
          value={previousScriptText}
          onChange={(e) => setPreviousScriptText(e.target.value)}
          rows={6}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm resize-y"
          placeholder="前回の台本全文をここに貼り付けると、「前回〇〇とお伝えしました→的中！おめでとうございます」形式の導入パートを自動生成します"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          貼り付けると前回予測の的中判定と、導入用の振り返り文章がレポートに含まれます
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[var(--accent)] px-6 py-3 font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "生成中..." : "レポート生成を開始"}
      </button>
    </form>
  );
}
