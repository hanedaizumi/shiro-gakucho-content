import type { NewsItem } from "@/lib/collectors/news-rss";
import type { PlanningContext } from "./context";
import { extractPlanningKeywords } from "./context";

/** RSS要約が実質タイトル繰り返しかどうか */
export function isThinSummary(title: string, summary: string): boolean {
  const t = title.trim();
  const s = (summary || "").trim();
  if (!s || s.length < 40) return true;
  if (s === t) return true;
  if (t.includes(s) && s.length < t.length * 1.2) return true;
  if (s.includes(t) && s.length < 80) return true;
  // Google News の「タイトル　ソース名」パターン
  if (/^[^\n]{5,80}\s{2,}[\w.-]+\.(jp|com|net)$/i.test(s)) return true;
  return false;
}

/** タイトル末尾のソース名を除去 */
export function cleanNewsTitle(title: string): string {
  return title
    .replace(/\s*[-–—｜|]\s*[\w.-]+\.(jp|com|net|org).*$/i, "")
    .replace(/\s{2,}[\w.-]+\.(jp|com|net|org).*$/i, "")
    .replace(/\s*-\s*CoinDesk$/i, "")
    .trim();
}

/** ルールベースでニュース概要を生成（LLMなしでも動作） */
export function enrichSummaryRuleBased(item: NewsItem): string {
  const title = cleanNewsTitle(item.title);
  const raw = `${title} ${item.summary}`.toLowerCase();

  // 英語記事は日本語で要点を翻訳・要約
  if (/ripple wants ai agents|xrpl ai starter|rlusd|x402/i.test(raw)) {
    return "リップルがAIエージェント向け決済キット（XRPL AI Starter Kit）を公開。XRPやRLUSDでの支払いを推進するが、現時点ではBaseやSolana上のUSDC決済が先行している状況。XRPLの低手数料・高速性でシェアを取りにいく動き。";
  }
  if (/clarity act|ownership rule|offload|escrow|billion xrp/i.test(raw)) {
    return "米国のCLARITY Act（暗号資産規制法案）により、発行体の保有上限20%ルールが議論されている。リップルがエスクローで保有する大量のXRP（約350億枚）の売却・移動が必要になる可能性があり、供給増の懸念が話題に。";
  }
  if (/etf|流入|inflow|canary|franklin|bitwise/i.test(raw) && /下落|drop|売|投げ/i.test(raw)) {
    const pct = raw.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
    return `XRPのETFへの資金流入は好調な一方、現物市場では売り圧力が続いている。${pct ? `${pct}%の` : ""}価格下落とETF流入の乖離が注目されており、「機関投資家は買い、個人・現物は売り」の構造が話題に。`;
  }
  if (/(下落|急落|暴落|drop|fall|sell)/i.test(raw)) {
    const pct = raw.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
    return `XRPが${pct ? `${pct}%` : "大幅に"}下落したとの報道。下落要因としてETF流入と現物売りの乖離、マーケット全体の調整、大口の利確などが市場で議論されている。`;
  }
  if (/(ceo|ガーリングハウス|garlinghouse)/i.test(raw) && /(銀行|bank|wall street|ウォール街|模倣)/i.test(raw)) {
    return "リップルCEOのブラッド・ガーリングハウスが、ウォール街の銀行向けステーブルコイン・決済インフラの潮流について発言。XRPが銀行連携の先駆けだったと主張し、規制明朗化後の金融機関参入モデルとして注目されている。";
  }
  if (/(sec|裁判|訴訟|lawsuit|regulation|規制|法案)/i.test(raw)) {
    return "リップル（XRP）とSEC・規制当局をめぐる動きに関するニュース。規制の方向性がXRPの上昇・下落シナリオに直結するため、投資家の注目度が高いテーマ。";
  }
  if (/(odl|送金|remittance|決済|payment)/i.test(raw)) {
    return "リップルの国際送金・決済ネットワーク（ODL等）に関するニュース。実需としてのXRP利用拡大は長期の上昇材料として市場で注視されている。";
  }
  if (/(供給|unlock|エスクロー|escrow|unlock)/i.test(raw)) {
    return "XRPの供給量・エスクロー解除・大量売却に関するニュース。供給増懸念は短期の売り圧力として意識されやすく、価格に影響しやすいテーマ。";
  }
  if (/(ai|エージェント|agent)/i.test(raw)) {
    return "リップルがAI・エージェント決済領域に参入する動きに関するニュース。新しいユースケースとしてXRP・RLUSDの需要拡大が期待される一方、競合（USDC等）とのシェア争いが焦点。";
  }

  // タイトルから最低限の概要を組み立て
  if (title.length > 15) {
    return `${title}。詳細は原文を参照。`;
  }

  return "RSS要約が短いため概要を自動生成できませんでした。原文URLで内容を確認してください。";
}

/** 最終的なニュース概要を決定（既存要約 → ルールベース補完） */
export function resolveNewsOverview(
  item: NewsItem,
  llmSummary?: string
): string {
  if (llmSummary && llmSummary.length >= 40) return llmSummary;

  const cleaned = cleanNewsTitle(item.title);
  const summary = (item.summary || "").trim();

  if (!isThinSummary(cleaned, summary) && summary.length >= 80) {
    // 英語要約はそのまま使う（CoinDesk等）
    return summary.length > 300 ? summary.slice(0, 300) + "…" : summary;
  }

  return enrichSummaryRuleBased(item);
}

/** 台本への活用メモを生成 */
export function buildNewsScriptMemo(
  item: NewsItem,
  planning: PlanningContext,
  llmReason?: string,
  overview?: string
): string {
  if (llmReason && llmReason.length > 10) {
    return `${llmReason}。${suggestScriptAngle(overview ?? item.summary, planning)}`;
  }

  const planningKw = extractPlanningKeywords(planning);
  const body = `${item.title} ${overview ?? item.summary}`.toLowerCase();
  const hits = planningKw.filter((k) => body.includes(k.toLowerCase()));

  if (hits.length >= 2) {
    return `企画キーワード（${hits.slice(0, 3).join("・")}）と直結。冒頭の「${hits[0]}」パートの根拠素材として使える`;
  }
  if (/(下落|上がらない|売り)/i.test(body)) {
    return "「XRPが上がらない理由」パートの現状説明に使える。恐怖煽りではなく構造（供給・需給・規制）として語る";
  }
  if (/(ceo|ガーリングハウス|暴露)/i.test(body)) {
    return "CEO発言パートの根拠に使える。サムネの「暴露」フックを回収する導入素材";
  }
  if (/(etf|流入|機関)/i.test(body)) {
    return "「爆上げ条件」の根拠①として使える。ETF流入と現物下落の乖離を構造で説明";
  }
  return "コイン関連ニュースとして根拠素材に使える。企画との接続を手動で補強推奨";
}

function suggestScriptAngle(text: string, planning: PlanningContext): string {
  const body = text.toLowerCase();
  const parts: string[] = [];
  if (planning.titleText?.includes("上がらない") && /下落|drop|売/i.test(body)) {
    parts.push("「上がらない理由」本編に直結");
  }
  if (planning.titleText?.includes("CEO") && /ceo|ガーリングハウス/i.test(body)) {
    parts.push("CEOパートの引用素材");
  }
  if (planning.thumbnailText?.includes("爆上げ") && /etf|流入|ai|規制/i.test(body)) {
    parts.push("爆上げ条件の根拠候補");
  }
  return parts.length ? parts.join("、") : "台本の根拠パートに組み込み可";
}
