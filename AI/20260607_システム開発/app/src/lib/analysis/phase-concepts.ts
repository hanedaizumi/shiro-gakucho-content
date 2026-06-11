import type { ConfluenceAnalysis } from "./confluence";
import type { PhaseDetectionResult } from "./phase-detector";
import type { AnalysisInput } from "./concept-library";
import { formatPrice } from "./indicators";
import type { MarketPhase } from "./phase-detector";

export type PhaseConcept =
  | "RSIダイバージェンスと清算の連鎖"
  | "200日移動平均線との乖離率"
  | "価格帯出来高"
  | "ボリンジャーバンド・スクイーズ"
  | "ダウ理論の厳密定義"
  | "フィボナッチ0.618"
  | "オーダーブロック"
  | "上昇ウェッジのブレイク"
  | "逆三尊の正しい見方"
  | "エリオット波動・第三波"
  | "ATRを使った損切り・利確の科学"
  | "出来高で見抜く本物のブレイク"
  | "ローソク足のヒゲが語る攻防（ピンバー）";

/**
 * 過去動画で既に取り上げたテーマ（恒久除外）。
 * ここに含まれるキーワードにマッチする概念は二度と⑤の主題に選ばれない。
 */
export const PERMANENTLY_COVERED_TOPICS = [
  "移動平均線",
  "逆三尊",
  "リテスト",
  "VWAP",
] as const;

/** 概念ごとのトピックキーワード（重複判定用。表記揺れを吸収する） */
const CONCEPT_TOPIC_KEYWORDS: Record<PhaseConcept, string[]> = {
  "RSIダイバージェンスと清算の連鎖": ["ダイバージェンス", "清算の連鎖"],
  "200日移動平均線との乖離率": ["移動平均", "乖離率", "200日MA", "200MA"],
  "価格帯出来高": ["価格帯出来高", "出来高プロファイル", "VPVR", "POC"],
  "ボリンジャーバンド・スクイーズ": ["ボリンジャー", "スクイーズ"],
  "ダウ理論の厳密定義": ["ダウ理論"],
  "フィボナッチ0.618": ["フィボナッチ"],
  "オーダーブロック": ["オーダーブロック", "SMC"],
  "上昇ウェッジのブレイク": ["ウェッジ"],
  "逆三尊の正しい見方": ["逆三尊", "三尊", "ヘッドアンドショルダー"],
  "エリオット波動・第三波": ["エリオット"],
  "ATRを使った損切り・利確の科学": ["ATR", "損切り幅"],
  "出来高で見抜く本物のブレイク": ["ダマシ", "ブレイクの真偽", "出来高で見抜く"],
  "ローソク足のヒゲが語る攻防（ピンバー）": ["ピンバー", "ヒゲ分析", "プライスアクション"],
};

/** 使用済みリスト（過去テーマ）と概念がトピックレベルで重複するか判定する */
export function isConceptCovered(name: PhaseConcept, usedConcepts: string[]): boolean {
  const allUsed = [...usedConcepts, ...PERMANENTLY_COVERED_TOPICS];
  const keywords = [...(CONCEPT_TOPIC_KEYWORDS[name] ?? []), name];
  return allUsed.some((u) => {
    if (!u) return false;
    if (u.includes(name) || name.includes(u)) return true;
    return keywords.some((k) => u.includes(k) || k.includes(u));
  });
}

export const PHASE_CONCEPT_MAP: Record<MarketPhase, PhaseConcept[]> = {
  crash_bottom: [
    "RSIダイバージェンスと清算の連鎖",
    "200日移動平均線との乖離率",
    "逆三尊の正しい見方",
    "ローソク足のヒゲが語る攻防（ピンバー）",
    "価格帯出来高",
    "ATRを使った損切り・利確の科学",
  ],
  range: [
    "価格帯出来高",
    "ボリンジャーバンド・スクイーズ",
    "ダウ理論の厳密定義",
    "出来高で見抜く本物のブレイク",
    "ATRを使った損切り・利確の科学",
  ],
  strong_trend_bull: [
    "エリオット波動・第三波",
    "フィボナッチ0.618",
    "オーダーブロック",
    "出来高で見抜く本物のブレイク",
    "ATRを使った損切り・利確の科学",
  ],
  strong_trend_bear: [
    "エリオット波動・第三波",
    "上昇ウェッジのブレイク",
    "オーダーブロック",
    "ローソク足のヒゲが語る攻防（ピンバー）",
    "ATRを使った損切り・利確の科学",
  ],
  reversal: [
    "RSIダイバージェンスと清算の連鎖",
    "逆三尊の正しい見方",
    "ダウ理論の厳密定義",
    "ローソク足のヒゲが語る攻防（ピンバー）",
    "出来高で見抜く本物のブレイク",
  ],
};

/** 全概念のフラットリスト（フェーズ候補が全滅した時のフォールバック用） */
const ALL_CONCEPTS = Object.keys(CONCEPT_TOPIC_KEYWORDS) as PhaseConcept[];

export function pickConceptByPhase(
  phase: MarketPhase,
  t: AnalysisInput,
  usedConcepts: string[],
  divHint: PhaseDetectionResult["rsiDivergenceHint"]
): { name: PhaseConcept; reason: string; score: number } {
  const candidates = PHASE_CONCEPT_MAP[phase];
  let best: { name: PhaseConcept; reason: string; score: number } | null = null;

  for (const name of candidates) {
    if (isConceptCovered(name, usedConcepts)) continue;

    let score = 15;

    switch (name) {
      case "RSIダイバージェンスと清算の連鎖":
        if (divHint === "bullish") score += 45;
        else if (divHint === "bearish") score += 25;
        else if (t.rsiDaily < 25) score += 20;
        if (t.volumeSpike) score += 10;
        if (divHint === "none" && t.rsiDaily < 30) score -= 15;
        break;
      case "200日移動平均線との乖離率":
        if (Math.abs(t.ma200Divergence) >= 20) score += 50;
        else if (Math.abs(t.ma200Divergence) >= 12) score += 30;
        break;
      case "価格帯出来高":
        if (t.volumeSpike) score += 35;
        if (phase === "range") score += 20;
        break;
      case "ボリンジャーバンド・スクイーズ":
        if (phase === "range" && Math.abs(t.change7d) < 5) score += 40;
        break;
      case "ダウ理論の厳密定義":
        if (phase === "range" || phase === "reversal") score += 25;
        break;
      case "フィボナッチ0.618":
        if (Math.abs(t.change7d) > 6) score += 30;
        break;
      case "オーダーブロック":
        if (t.volumeSpike && t.trend !== "neutral") score += 35;
        break;
      case "上昇ウェッジのブレイク":
        if (t.trend === "bearish" && t.candleCharacteristics.includes("上ヒゲ")) score += 40;
        break;
      case "逆三尊の正しい見方":
        if (phase === "crash_bottom" || phase === "reversal") score += 30;
        if (t.rsiDaily < 35) score += 15;
        break;
      case "エリオット波動・第三波":
        if (Math.abs(t.change7d) > 10) score += 40;
        else if (Math.abs(t.change7d) > 6) score += 20;
        break;
      case "ATRを使った損切り・利確の科学":
        // ボラティリティが高い（ATRが価格の3%超）局面で特に刺さる実用テーマ
        if (t.atr14 / t.currentPrice > 0.03) score += 35;
        else score += 20;
        break;
      case "出来高で見抜く本物のブレイク":
        if (t.volumeSpike) score += 40;
        // 重要ラインに近い（±2%）＝ブレイク判定が今週の課題になる
        if (t.keyLevels.some((l) => Math.abs(l.price - t.currentPrice) / t.currentPrice < 0.02)) score += 25;
        break;
      case "ローソク足のヒゲが語る攻防（ピンバー）":
        if (t.candleCharacteristics.includes("ヒゲ")) score += 40;
        if (phase === "crash_bottom" || phase === "reversal") score += 15;
        break;
    }

    if (!best || score > best.score) {
      best = { name, reason: buildPhaseConceptReason(name, t, divHint), score };
    }
  }

  // フェーズ候補が全て使用済みの場合、全概念から未使用のものを探す
  if (!best) {
    const fallback = ALL_CONCEPTS.find((n) => !isConceptCovered(n, usedConcepts));
    const name = fallback ?? "ATRを使った損切り・利確の科学";
    best = { name, reason: buildPhaseConceptReason(name, t, divHint), score: 10 };
  }

  return best;
}

function buildPhaseConceptReason(
  name: PhaseConcept,
  t: AnalysisInput,
  divHint: PhaseDetectionResult["rsiDivergenceHint"]
): string {
  switch (name) {
    case "RSIダイバージェンスと清算の連鎖":
      return `RSI${t.rsiDaily.toFixed(0)}＋${divHint === "bullish" ? "強気ダイバージェンス兆候" : "売られすぎ"}で反転局面を監視`;
    case "200日移動平均線との乖離率":
      return `乖離率${t.ma200Divergence.toFixed(1)}%は機関の注目水準`;
    case "価格帯出来高":
      return "出来高密集帯が今週の攻防ライン";
    case "ボリンジャーバンド・スクイーズ":
      return "ボラティリティ収縮後のブレイクを警戒";
    case "ATRを使った損切り・利確の科学":
      return `ATR${formatPrice(t.atr14)}ドルの高ボラ局面。損切り幅の設計が勝敗を分ける`;
    case "出来高で見抜く本物のブレイク":
      return "重要ライン攻防中。ブレイクの真偽判定が今週の最重要スキル";
    case "ローソク足のヒゲが語る攻防（ピンバー）":
      return "ヒゲが連続する攻防局面。1本のローソク足から売り買いの力関係を読む";
    default:
      return `${name}が今週のフェーズに最適`;
  }
}

function pickBriefEvidence(
  t: AnalysisInput,
  confluence: ConfluenceAnalysis
): string[] {
  const items: string[] = [];
  if (t.trendReasons[0]) items.push(t.trendReasons[0]);
  if (t.volumeSpike && items.length < 2) {
    items.push("直近は出来高が急増し、大口の動きが入っています");
  }
  if (Math.abs(t.ma200Divergence) >= 12 && items.length < 2) {
    items.push(`200日MAからの乖離率は${t.ma200Divergence.toFixed(1)}%です`);
  }
  if (items.length < 2 && confluence.phaseReasons[0]) {
    items.push(confluence.phaseReasons[0]);
  }
  return items.slice(0, 2);
}

export function buildPhaseLocationSection(
  t: AnalysisInput,
  confluence: ConfluenceAnalysis,
  keyLevelsBlock: string
): string {
  const trendWord =
    t.trend === "bearish" ? "下落" : t.trend === "bullish" ? "上昇" : "レンジ";
  const evidence = pickBriefEvidence(t, confluence);

  const supports = t.keyLevels
    .filter((l) => l.type === "support")
    .sort((a, b) => b.price - a.price)
    .slice(0, 2);
  const resistances = t.keyLevels
    .filter((l) => l.type === "resistance")
    .sort((a, b) => a.price - b.price)
    .slice(0, 2);

  const lineSummary = [
    ...resistances.map((l) => `レジスタンス ${formatPrice(l.price)}ドル`),
    ...supports.map((l) => `サポート ${formatPrice(l.price)}ドル`),
  ].join("、");

  return `## ④ BTCの現在地（日足分析）

まずは日足です。

今のビットコインは${formatPrice(t.currentPrice)}ドル付近を推移しています。
7日間で${t.change7d >= 0 ? "+" : ""}${t.change7d.toFixed(1)}%の変化があり、相場は${confluence.phaseLabel}の地形です。

チャートを見てみると、${confluence.structureLayer.dowVerdict}
基本は${trendWord}目線で問題ありません。

${evidence.map((e) => `${e}。`).join("\n")}
${t.candleCharacteristics ? `${t.candleCharacteristics}` : ""}

今週いちばん意識すべきラインは、${lineSummary || "重要な水平線"}です。
${keyLevelsBlock.trim() ? keyLevelsBlock : ""}

では、どうなれば${trendWord}トレンドが転換したと言えるのか？

${t.trendReversalCondition}

この条件が揃うまでは、ラインを主軸に待つのが正解です。次のセクションで、今週のトリガー指標を解説します。`;
}

export function buildThreePartConceptSection(
  concept: string,
  t: AnalysisInput,
  confluence: ConfluenceAnalysis
): string {
  const support = t.keyLevels.filter((l) => l.type === "support").sort((a, b) => b.price - a.price)[0];
  const resistance = t.keyLevels.filter((l) => l.type === "resistance").sort((a, b) => a.price - b.price)[0];

  const builders: Record<string, () => string> = {
    "RSIダイバージェンスと清算の連鎖": () => `## ⑤ 今週の注目インジケーター：RSIダイバージェンスと清算の連鎖

**【コンフルエンス：トリガーレイヤー】**
構造は${confluence.phaseLabel}。その中で今週のトリガーは「${concept}」です。

**① この指標が意味するもの（学習）**

RSIは「買われすぎ・売られすぎ」を見るだけの指標ではありません。価格とRSIの動きが逆行する**ダイバージェンス（逆行現象）**を見つけることで、トレンドの勢いが失われつつある転換点を察知できます。

また、大規模な清算（ロスカット）が連鎖すると、パニック売りが一気に出て**セリング・クライマックス**（売りのピーク）になりやすい。プロはこの2つをセットで見ます。

**② 現在のBTCチャートにおける状況（分析）**

日足RSIは${t.rsiDaily.toFixed(1)}。歴史的に見ても売られすぎの水準です。
${confluence.eventOverlay ? `${confluence.eventOverlay}。` : "直近の出来高急増から、投げ売りが集中した可能性があります。"}

価格は安値を更新しつつありますが、4時間足で**価格は下げているのにRSIが切り上がる強気ダイバージェンス**が確認されれば、ショートカバーを巻き込んだ急反発のサインになります。現時点では「待ち」の局面です。

**③ アクションへの示唆（実践）**

${confluence.actionBridge}

安易な値ごろ感ロングは禁止。${support ? formatPrice(support.price) : formatPrice(t.currentPrice * 0.97)}ドル付近で下げ止まり＋下ヒゲ＋ダイバージェンス確認まで待つ。ショートは${resistance ? formatPrice(resistance.price) : formatPrice(t.currentPrice * 1.03)}ドルまで引き付けて戻り売りが安全です。`,

    "200日移動平均線との乖離率": () => `## ⑤ 今週の注目インジケーター：200日移動平均線との乖離率

**【コンフルエンス：トリガーレイヤー】**
構造は${confluence.phaseLabel}。トリガーは乖離率${t.ma200Divergence.toFixed(1)}%です。

**① この指標が意味するもの（学習）**

200日移動平均線は機関投資家のベースライン。「今の価格がそこから何%離れているか」が乖離率です。極端な乖離は平均回帰（戻り）を招きやすい。

**② 現在のBTCチャートにおける状況（分析）**

200日MAは約${formatPrice(t.ma200)}ドル。現在${formatPrice(t.currentPrice)}ドルで乖離率${t.ma200Divergence.toFixed(1)}%。
BTCで-20%超の乖離は2020年3月と2022年の大底付近のみ。いずれもその後大きな反発が発生しています。

**③ アクションへの示唆（実践）**

${confluence.actionBridge}`,

    "価格帯出来高": () => `## ⑤ 今週の注目インジケーター：価格帯出来高

**【コンフルエンス：トリガーレイヤー】**
${confluence.phaseLabel}における攻防ラインを出来高で特定します。

**① この指標が意味するもの（学習）**

価格帯出来高（Volume Profile）は「どの価格でどれだけ取引されたか」を可視化したもの。POC（最多出来高価格）は多くのトレーダーが納得した価格帯です。

**② 現在のBTCチャートにおける状況（分析）**

高出来日の終値クラスタは${support ? formatPrice(support.price) : formatPrice(t.currentPrice * 0.97)}ドル付近。今の${formatPrice(t.currentPrice)}ドルはその密集帯に位置しています。

**③ アクションへの示唆（実践）**

${confluence.actionBridge}`,

    "ボリンジャーバンド・スクイーズ": () => `## ⑤ 今週の注目インジケーター：ボリンジャーバンド・スクイーズ

**【コンフルエンス：トリガーレイヤー】**
レンジ相場でボラティリティ収縮後のブレイクを狙います。

**① この指標が意味するもの（学習）**

ボリンジャーバンドの幅が極端に狭まる「スクイーズ」は、エネルギーが圧縮された状態。解放後は一方向に大きく動きやすい。

**② 現在のBTCチャートにおける状況（分析）**

7日変化が${t.change7d >= 0 ? "+" : ""}${t.change7d.toFixed(1)}%と限定的で、レンジ内のボラティリティ収縮が進行。${confluence.structureLayer.primarySupport}と${confluence.structureLayer.primaryResistance}の間で推移。

**③ アクションへの示唆（実践）**

${confluence.actionBridge}`,
  };

  const builder = builders[concept];
  if (builder) return builder();

  return `## ⑤ 今週の注目インジケーター：${concept}

**【コンフルエンス】** ${confluence.synthesis}

**① この指標が意味するもの（学習）**
${concept}は今週の${confluence.phaseLabel}において最も有効なトリガー指標です。

**② 現在のBTCチャートにおける状況（分析）**
${confluence.triggerLayer.reason}

**③ アクションへの示唆（実践）**
${confluence.actionBridge}`;
}
