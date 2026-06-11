import type { AnalysisInput } from "./concept-library";
import type { ConfluenceAnalysis, KeyLevel } from "@/lib/types";
import type { PhaseDetectionResult } from "./phase-detector";
import { formatPrice } from "./indicators";

export type { ConfluenceAnalysis };

function topLevels(levels: KeyLevel[], type: "support" | "resistance", price: number) {
  const filtered = levels.filter((l) => l.type === type);
  if (type === "support") {
    return filtered.filter((l) => l.price <= price).sort((a, b) => b.price - a.price)[0];
  }
  return filtered.filter((l) => l.price >= price).sort((a, b) => a.price - b.price)[0];
}

export function buildConfluence(
  t: AnalysisInput,
  phase: PhaseDetectionResult,
  conceptName: string,
  conceptReason: string
): ConfluenceAnalysis {
  const support = topLevels(t.keyLevels, "support", t.currentPrice);
  const resistance = topLevels(t.keyLevels, "resistance", t.currentPrice);

  const trendWord =
    t.trend === "bearish" ? "下落トレンド" : t.trend === "bullish" ? "上昇トレンド" : "レンジ";

  const terrain =
    phase.phase === "crash_bottom"
      ? `暴落後の${trendWord}。価格は重要サポート付近で踏みとどまりを試している`
      : phase.phase === "range"
        ? "明確なトレンドがなく、サポートとレジスタンスの間を往復"
        : phase.phase === "reversal"
          ? `${trendWord}の終盤。売り（または買い）の勢いが弱まりつつある`
          : `${trendWord}の真っ只中。トレンドフォローが基本`;

  const structureSummary = `【構造レイヤー】今の地形は「${phase.label}」×「${trendWord}」。${t.trendReasons[0] ?? ""}`;

  const synthesisParts = [
    structureSummary,
    `【トリガーレイヤー】今週の主役は「${conceptName}」。${conceptReason}`,
  ];
  if (phase.eventOverlay) synthesisParts.push(`【イベント層】${phase.eventOverlay}`);
  const synthesis = synthesisParts.join("\n");

  let actionBridge = "";
  if (phase.phase === "crash_bottom" || phase.phase === "reversal") {
    actionBridge = `構造は${t.trend === "bearish" ? "下落" : "中立"}だが、売られすぎシグナルが反発条件を示しつつある。${support ? formatPrice(support.price) : formatPrice(t.currentPrice * 0.97)}ドル付近で下ヒゲ＋4時間足陽線確定までロングは待つ。`;
  } else if (phase.phase === "range") {
    actionBridge = `レンジ上限${resistance ? formatPrice(resistance.price) : "（要確認）"}ドルと下限${support ? formatPrice(support.price) : "（要確認）"}ドルの2本を引く。出来高とローソク足の形でブレイク方向を確認してからエントリー`;
  } else if (phase.phase === "strong_trend_bull") {
    actionBridge = `上昇トレンド中は押し目買い。${support ? formatPrice(support.price) : formatPrice(t.currentPrice * 0.97)}ドル付近で反発の形（下ヒゲ＋陽線確定）を確認してロング`;
  } else {
    actionBridge = `下落トレンド中は戻り売り。${resistance ? formatPrice(resistance.price) : formatPrice(t.currentPrice * 1.05)}ドル付近で上ヒゲ陰線などの反落サインが揃えばショート`;
  }

  return {
    phase: phase.phase,
    phaseLabel: phase.label,
    phaseReasons: phase.reasons,
    structureLayer: {
      summary: structureSummary,
      terrain,
      dowVerdict: t.trendReasons.join("。"),
      primarySupport: support
        ? `${formatPrice(support.price)}ドル（${support.reason}）`
        : "直下に明確なサポートなし",
      primaryResistance: resistance
        ? `${formatPrice(resistance.price)}ドル（${resistance.reason}）`
        : "直上に明確なレジスタンスなし",
    },
    triggerLayer: {
      concept: conceptName,
      reason: conceptReason,
    },
    synthesis,
    actionBridge,
    eventOverlay: phase.eventOverlay,
  };
}
