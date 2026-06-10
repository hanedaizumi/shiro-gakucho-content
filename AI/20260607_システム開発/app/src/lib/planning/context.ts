export type TradingBias = "bullish" | "bearish" | "neutral";

export interface PlanningContext {
  thumbnailText: string;
  titleText: string;
  /** 台本の方向性・仮説（任意）。LLMによるニュース意味スコアリングに使用される */
  storyHypothesis: string;
  /** テクニカル分析のバイアス方向（上昇優先/下落優先/中立） */
  tradingBias: TradingBias;
}

export function normalizePlanning(input?: {
  thumbnailText?: string;
  titleText?: string;
  storyHypothesis?: string;
  tradingBias?: TradingBias;
}): PlanningContext {
  return {
    thumbnailText: input?.thumbnailText?.trim() ?? "",
    titleText: input?.titleText?.trim() ?? "",
    storyHypothesis: input?.storyHypothesis?.trim() ?? "",
    tradingBias: input?.tradingBias ?? "neutral",
  };
}

/** サムネ・タイトルからリサーチ用キーワードを抽出 */
export function extractPlanningKeywords(planning: PlanningContext): string[] {
  const raw = `${planning.thumbnailText} ${planning.titleText}`;
  const tokens = new Set<string>();

  const patterns = [
    /[A-Za-z]{2,10}/g,
    /[\d,，]+(?:億|万|兆|%|ドル)?/g,
    /[\u3040-\u9fff]{2,}/g,
  ];

  for (const pattern of patterns) {
    for (const m of raw.matchAll(pattern)) {
      const t = m[0].trim();
      if (t.length >= 2) tokens.add(t);
    }
  }

  const stop = new Set([
    "最新", "知らない", "仮想通貨", "爆上げ", "ヤバい", "真実", "保有者",
    "the", "and", "for", "with", "new", "now",
  ]);

  return [...tokens]
    .filter((t) => !stop.has(t) && t.length >= 2)
    .slice(0, 20);
}

export function scorePlanningRelevance(text: string, keywords: string[]): number {
  if (!keywords.length) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) score += 1;
  }
  return score;
}

/** テキストから数値ハイライトを抽出 */
export function extractNumericHighlights(text: string): string[] {
  const highlights = new Set<string>();
  const patterns = [
    /[\d,，]+(?:\.\d+)?\s*(?:億|兆|万)\s*(?:円|ドル)?/g,
    /(?:約|約)?[\d,，]+(?:\.\d+)?\s*(?:億|兆|万)?\s*ドル/g,
    /[\d,，]+(?:\.\d+)?%/g,
    /\$[\d,，]+(?:\.\d+)?(?:\s*(?:billion|million|B|M))?/gi,
    /[\d,，]{2,}(?:\s*USD)/gi,
  ];

  for (const pattern of patterns) {
    for (const m of text.matchAll(pattern)) {
      const v = m[0].trim();
      if (v.length >= 2) highlights.add(v);
    }
  }

  return [...highlights].slice(0, 8);
}

/** 企画メモ（台本の軸）を自動生成 */
export function buildPlanningAxisMemo(
  planning: PlanningContext,
  coinName: string,
  coinSymbol: string
): string[] {
  const lines: string[] = [];
  const kw = extractPlanningKeywords(planning);

  if (planning.thumbnailText) {
    lines.push(
      `サムネ「${planning.thumbnailText}」のフックを冒頭で回収し、視聴者の「え、どういうこと？」を論理で解消する`
    );
  }
  if (planning.titleText) {
    lines.push(
      `タイトル「${planning.titleText}」の訴求軸（${kw.slice(0, 4).join("・") || coinSymbol}）を本編の3本柱に落とし込む`
    );
  }
  lines.push(
    `${coinName}（${coinSymbol}）の動きを「恐怖煽り」ではなく「構造→条件→行動」で説明する`
  );
  if (planning.storyHypothesis) {
    lines.push(`台本仮説：「${planning.storyHypothesis}」を根拠付けるニュースを優先`);
  }
  if (kw.length) {
    lines.push(`企画キーワードとの接続を優先: ${kw.join("、")}`);
  }
  return lines;
}

export function formatCount(n: number): string {
  if (n >= 100_000_000) return `約${(n / 100_000_000).toFixed(1)}億`;
  if (n >= 10_000) return `約${Math.round(n / 10_000)}万`;
  if (n >= 1_000) return `約${(n / 1_000).toFixed(1)}千`;
  return String(n);
}
