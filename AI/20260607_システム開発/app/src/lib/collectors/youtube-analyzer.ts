import type { YouTubeVideo } from "./youtube";
import {
  extractPlanningKeywords,
  scorePlanningRelevance,
  type PlanningContext,
} from "@/lib/planning/context";

export interface YouTubeVideoAnalysis {
  videoId: string;
  title: string;
  channel: string;
  publishedAt: string;
  url: string;
  fromWatchedChannel: boolean;
  contentSource: "transcript" | "description" | "title_only";
  sentiment: "bullish" | "bearish" | "neutral" | "mixed";
  mentionedPrices: number[];
  keyPoints: string[];
  summary: string;
  excerpt: string;
  viewCount?: number;
  subscriberCount?: number;
  spreadRate?: number;
  isInternational?: boolean;
  hookAnalysis?: string;
  structureAnalysis?: string[];
  differentiationMemo?: string[];
}

const BULLISH = [
  "上昇", "ロング", "買い", "反発", "ブレイク", "上抜け", "bullish", "long", "buy", "rally", "breakout",
];
const BEARISH = [
  "下落", "ショート", "売り", "割れ", "下抜け", "調整", "bearish", "short", "sell", "dump", "breakdown",
];

const HOOK_WORDS = [
  "警告", "WARNING", "衝撃", "SHOCK", "暴露", "EXPOSED", "売却", "SELLS", "爆上げ", "MAJOR",
  "知らない", "99%", "緊急", "URGENT", "deadline", "法案", "ETF",
];

function extractPrices(text: string): number[] {
  const prices = new Set<number>();
  const patterns = [
    /\$?\s*([\d]{1,3}[,.]?\d{0,3}(?:\.\d+)?)\s*(?:ドル|dollar|USD|億|万)?/gi,
    /([\d]{1,3})[,，](\d{3})\s*(?:ドル|USD)?/g,
  ];

  for (const pattern of patterns) {
    for (const m of text.matchAll(pattern)) {
      const raw = m[1] ? String(m[1]).replace(/[,，]/g, "") : "";
      const n = parseFloat(raw);
      if (n >= 0.01 && n <= 500000) prices.add(n < 100 ? Math.round(n * 100) / 100 : Math.round(n));
    }
  }

  return [...prices].sort((a, b) => a - b).slice(0, 8);
}

function detectSentiment(text: string): YouTubeVideoAnalysis["sentiment"] {
  const lower = text.toLowerCase();
  let bull = 0;
  let bear = 0;
  for (const w of BULLISH) if (lower.includes(w.toLowerCase())) bull++;
  for (const w of BEARISH) if (lower.includes(w.toLowerCase())) bear++;
  if (bull > 0 && bear > 0) return "mixed";
  if (bull > bear) return "bullish";
  if (bear > bull) return "bearish";
  return "neutral";
}

function extractKeyPoints(text: string): string[] {
  const sentences = text
    .split(/[。．\n.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  const keywords = [
    "サポート", "レジスタンス", "エントリー", "損切り", "利確", "トレンド",
    "ETF", "法案", "売却", "流入", "ODL", "送金", "マーケットメイカー",
    "support", "resistance", "entry", "stop", "target", "bill", "SEC",
  ];

  const scored = sentences
    .map((s) => ({
      s,
      score: keywords.reduce((acc, k) => (s.toLowerCase().includes(k.toLowerCase()) ? acc + 1 : acc), 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 6).map((x) => x.s.slice(0, 150));
}

function buildHookAnalysis(
  video: YouTubeVideo,
  content: string,
  planning?: PlanningContext
): string {
  const titleLower = video.title.toLowerCase();
  const hooks = HOOK_WORDS.filter((w) => titleLower.includes(w.toLowerCase()));
  const planningKw = planning ? extractPlanningKeywords(planning) : [];
  const planningMatch = planningKw.filter((k) =>
    `${video.title} ${content}`.toLowerCase().includes(k.toLowerCase())
  );

  const parts: string[] = [];
  if (hooks.length) {
    parts.push(`タイトルで「${hooks.slice(0, 3).join("」「")}」系のフックを使用`);
  }
  if (video.spreadRate && video.spreadRate >= 2) {
    parts.push(`拡散率${video.spreadRate.toFixed(1)}倍で拡散成功`);
  }
  if (planningMatch.length) {
    parts.push(`企画キーワード（${planningMatch.join("、")}）と一致`);
  }
  const sentiment = detectSentiment(content);
  const sentimentLabel = {
    bullish: "上昇・買い寄りのトーン",
    bearish: "下落・恐怖喚起のトーン",
    neutral: "中立・解説寄り",
    mixed: "上昇と下落の両方を提示",
  }[sentiment];
  parts.push(sentimentLabel);

  const excerpt = content.slice(0, 200).replace(/\n/g, " ");
  if (excerpt) parts.push(`冒頭要素: ${excerpt}…`);

  return parts.join("。") + "。";
}

function buildDifferentiationMemo(
  video: YouTubeVideo,
  planning?: PlanningContext
): string[] {
  const memos = [
    "恐怖煽り（WARNING/SHOCK系）が強い場合はシロ学長NG。「構造→条件→行動」で差別化",
    "英語のみ・海外向け構成の場合は、日本の30〜50代向けに日常例え（NISA・物価高・円安）を追加",
    "専門用語が多い場合は「ルールブックを国が決める」等の日常翻訳を入れる",
  ];

  if (planning?.thumbnailText) {
    memos.push(
      `サムネ「${planning.thumbnailText}」のフックを回収し、恐怖のあとに「仕組みが分かれば行動できる」希望まで持っていく`
    );
  }
  if (planning?.titleText) {
    memos.push(`タイトルの訴求軸とズレている競合は、最新の日本向け文脈で上書きできる`);
  }
  if (video.isInternational) {
    memos.push(
      "【海外動画】英語圏の切り口・データを日本向けに翻訳・日常例えで差別化できる（他の日本YouTuberが触れていない情報源）"
    );
  } else if (!video.title.match(/日本|円|NISA|物価/i)) {
    memos.push("競合が触れていない日本市場・国内利用者目線を目玉にできる");
  }

  return memos.slice(0, 5);
}

function buildSummary(
  video: YouTubeVideo,
  sentiment: YouTubeVideoAnalysis["sentiment"],
  prices: number[],
  keyPoints: string[]
): string {
  const pricePart =
    prices.length > 0
      ? `言及価格帯: ${prices.map((p) => (p < 1000 ? `${p}ドル` : `${p.toLocaleString()}ドル`)).join("、")}。`
      : "";
  const sentimentLabel = {
    bullish: "上昇寄りの見方",
    bearish: "下落寄りの見方",
    neutral: "中立〜様子見",
    mixed: "上昇・下落の両シナリオ提示",
  }[sentiment];
  const points = keyPoints.length
    ? `要点: ${keyPoints.slice(0, 2).join(" / ")}`
    : video.description.slice(0, 100);
  return `[${video.channelTitle}] ${sentimentLabel}。${pricePart}${points}`;
}

export function analyzeYouTubeVideo(
  video: YouTubeVideo,
  planning?: PlanningContext
): YouTubeVideoAnalysis {
  const content =
    video.transcript?.trim() ||
    video.description?.trim() ||
    video.title;
  const contentSource: YouTubeVideoAnalysis["contentSource"] = video.transcript
    ? "transcript"
    : video.description
      ? "description"
      : "title_only";

  const mentionedPrices = extractPrices(content);
  const sentiment = detectSentiment(content);
  const keyPoints = extractKeyPoints(content);
  const excerpt = content.slice(0, 600);
  const structureAnalysis = keyPoints.length
    ? keyPoints
    : video.description
        .split(/\n/)
        .filter((l) => l.trim().length > 20)
        .slice(0, 5)
        .map((l) => l.trim().slice(0, 120));

  return {
    videoId: video.videoId,
    title: video.title,
    channel: video.channelTitle,
    publishedAt: video.publishedAt,
    url: video.url,
    fromWatchedChannel: video.fromWatchedChannel,
    contentSource,
    sentiment,
    mentionedPrices,
    keyPoints,
    summary: buildSummary(video, sentiment, mentionedPrices, keyPoints),
    excerpt,
    viewCount: video.viewCount,
    subscriberCount: video.subscriberCount,
    spreadRate: video.spreadRate,
    isInternational: video.isInternational,
    hookAnalysis: buildHookAnalysis(video, content, planning),
    structureAnalysis,
    differentiationMemo: buildDifferentiationMemo(video, planning),
  };
}

export function buildYouTubeConsensus(
  analyses: YouTubeVideoAnalysis[]
): {
  overallSentiment: string;
  commonPrices: number[];
  summaries: string[];
  watchedCount: number;
  totalCount: number;
} {
  if (!analyses.length) {
    return {
      overallSentiment: "拡散率2倍以上の動画なし",
      commonPrices: [],
      summaries: [],
      watchedCount: 0,
      totalCount: 0,
    };
  }

  const sentiments = analyses.map((a) => a.sentiment);
  const bull = sentiments.filter((s) => s === "bullish").length;
  const bear = sentiments.filter((s) => s === "bearish").length;
  let overallSentiment = "競合動画間で方向感は分散";
  if (bull > bear && bull > 0) overallSentiment = "競合は上昇寄りが多い";
  if (bear > bull && bear > 0) overallSentiment = "競合は下落・警告寄りが多い";

  const priceFreq = new Map<number, number>();
  for (const a of analyses) {
    for (const p of a.mentionedPrices) {
      priceFreq.set(p, (priceFreq.get(p) ?? 0) + 1);
    }
  }
  const commonPrices = [...priceFreq.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p)
    .slice(0, 5);

  return {
    overallSentiment,
    commonPrices,
    summaries: analyses.map((a) => a.summary),
    watchedCount: analyses.filter((a) => a.fromWatchedChannel).length,
    totalCount: analyses.length,
  };
}
