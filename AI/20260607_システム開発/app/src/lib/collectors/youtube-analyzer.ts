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
  contentOverview?: string;
  whyPerformingWell?: string;
}

const BULLISH = [
  "上昇", "ロング", "買い", "反発", "ブレイク", "上抜け", "bullish", "long", "buy", "rally", "breakout",
];
const BEARISH = [
  "下落", "ショート", "売り", "割れ", "下抜け", "調整", "bearish", "short", "sell", "dump", "breakdown",
];

const HOOK_WORDS = [
  "警告", "WARNING", "衝撃", "SHOCK", "暴露", "EXPOSED", "売却", "SELLS", "爆上げ", "MAJOR",
  "知らない", "99%", "緊急", "URGENT", "deadline", "法案", "ETF", "億", "億確定", "真実",
];

const PROMO_PATTERNS = [
  /line/i, /lin\.ee/i, /discord\.gg/i, /友達追加/, /特典希望/, /チャンネル登録/,
  /公式\s*line/i, /公式\s*x/i, /twitter\.com/i, /youtube\.com\/channel/i,
  /動画限定特典/, /友達追加▼/, /app\.lineproent/, /===/, /^━+$/,
  /^[❶❷❸❹❺]/, /▼仮想通貨で稼ぐ/, /永久無料/, /プレゼント/,
];

const CONTENT_KEYWORDS = [
  "xrp", "リップル", "ripple", "etf", "sec", "法案", "供給", "エスクロー", "odl", "送金",
  "価格", "予想", "シナリオ", "保有量", "億", "裁判", "規制", "ai", "銀行", "決済",
  "support", "resistance", "bill", "escrow", "supply", "inflow", "clarity",
];

function isPromoLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 8) return true;
  return PROMO_PATTERNS.some((p) => p.test(trimmed));
}

function cleanContentText(text: string): string {
  return text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isPromoLine(l))
    .join("\n");
}

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
  const cleaned = cleanContentText(text);
  const sentences = cleaned
    .split(/[。．\n.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && !isPromoLine(s));

  const keywords = [
    "サポート", "レジスタンス", "エントリー", "損切り", "利確", "トレンド",
    "ETF", "法案", "売却", "流入", "ODL", "送金", "マーケットメイカー",
    "support", "resistance", "entry", "stop", "target", "bill", "SEC",
    "XRP", "リップル", "保有量", "億", "シナリオ", "供給", "エスクロー",
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

function inferTopicFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (/1000\s*xrp|1000枚|30万円|20万円|億/.test(t)) {
    return "XRPの保有量・投資額と将来の資産増シナリオを解説する動画";
  }
  if (/上がらない|下落|売却|警告|deadline/.test(t)) {
    return "XRPが上がらない・下落する理由とリスクを解説する動画";
  }
  if (/爆上げ|億確定|rich|supply shock|etf/.test(t)) {
    return "XRPの上昇シナリオ・爆上げ条件を提示する動画";
  }
  if (/clarity|法案|sec|regulation|供給/.test(t)) {
    return "規制・法案・供給量がXRPに与える影響を解説する動画";
  }
  if (/ceo|ガーリングハウス|garlinghouse|暴露/.test(t)) {
    return "リップルCEOの発言や業界動向を軸にした解説動画";
  }
  return "XRP（リップル）の最新動向・投資判断を解説する動画";
}

function buildContentOverview(
  video: YouTubeVideo,
  cleanedContent: string,
  keyPoints: string[],
  contentSource: YouTubeVideoAnalysis["contentSource"]
): string {
  if (keyPoints.length >= 2) {
    const bullets = keyPoints.slice(0, 3).join("。");
    return `${inferTopicFromTitle(video.title)}。主な論点：${bullets}。`;
  }

  const sentences = cleanedContent
    .split(/[。．\n.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && !isPromoLine(s))
    .filter((s) =>
      CONTENT_KEYWORDS.some((k) => s.toLowerCase().includes(k.toLowerCase()))
    )
    .slice(0, 3);

  if (sentences.length) {
    return `${inferTopicFromTitle(video.title)}。${sentences.join("。")}。`;
  }

  if (contentSource === "title_only") {
    return `${inferTopicFromTitle(video.title)}。字幕・概要欄が取得できなかったため、タイトルから推定。`;
  }

  return `${inferTopicFromTitle(video.title)}。概要欄・字幕から具体的な論点の抽出が限定的。`;
}

function formatCountShort(n?: number): string {
  if (!n) return "不明";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}千`;
  return String(n);
}

function buildWhyPerformingWell(
  video: YouTubeVideo,
  content: string,
  sentiment: YouTubeVideoAnalysis["sentiment"],
  planning?: PlanningContext
): string {
  const reasons: string[] = [];
  const title = video.title;
  const titleLower = title.toLowerCase();

  if (video.spreadRate && video.spreadRate >= 2) {
    const subs = formatCountShort(video.subscriberCount);
    const views = formatCountShort(video.viewCount);
    if (video.spreadRate >= 5) {
      reasons.push(
        `登録者${subs}人に対して再生${views}回（拡散率${video.spreadRate.toFixed(1)}倍）。チャンネル規模を大きく超えるリーチ＝「テーマの刺さり方」がチャンネル力より強い`
      );
    } else {
      reasons.push(
        `拡散率${video.spreadRate.toFixed(1)}倍（登録者${subs}人→再生${views}回）で、登録者数の2倍超を達成`
      );
    }
  }

  const hooks: string[] = [];
  if (/億|億確定|rich|お金持ち|1000\s*xrp|1000枚/.test(titleLower)) {
    hooks.push("具体的な保有量・金額（1000XRP・20万円等）で視聴者が自分事化しやすい");
  }
  if (/緊急|urgent|警告|warning|shock|衝撃/.test(titleLower)) {
    hooks.push("「緊急」「警告」フレームで今すぐ見る動機を作っている");
  }
  if (/暴露|真実|裏シナリオ|exposed|secret/.test(titleLower)) {
    hooks.push("「暴露」「裏シナリオ」で情報の希少性・特別感を演出");
  }
  if (/上がらない|下落|売却|deadline/.test(titleLower)) {
    hooks.push("XRPホルダーの「上がらない不満・不安」に直撃するタイトル設計");
  }
  if (/ゆっくり/.test(title)) {
    hooks.push("ゆっくり解説形式で初心者でも見られる入口設計");
  }
  if (hooks.length) reasons.push(hooks.join("／"));

  if (sentiment === "bullish") {
    reasons.push("上昇・資産増のトーンが、XRPコミュニティの期待心理（爆上げ待ち）に合致");
  } else if (sentiment === "bearish") {
    reasons.push("下落・リスク警告のトーンが、不安を抱えるホルダーの関心を引く");
  }

  if (/(etf|法案|sec|ai|供給|エスクロー|clarity)/i.test(`${title} ${content}`)) {
    reasons.push("ETF・規制・供給・AIなど「今まさに話題」のキーワードを含み、検索流入を取りやすい");
  }

  if (planning) {
    const planningKw = extractPlanningKeywords(planning);
    const hits = planningKw.filter((k) =>
      `${title} ${content}`.toLowerCase().includes(k.toLowerCase())
    );
    if (hits.length >= 2) {
      reasons.push(`自社企画キーワード（${hits.slice(0, 3).join("・")}）とテーマが重なり、同じ視聴者層にリーチできている`);
    }
  }

  if (
    video.subscriberCount &&
    video.subscriberCount < 20000 &&
    video.spreadRate &&
    video.spreadRate >= 3
  ) {
    reasons.push("小規模チャンネルでも伸びている＝企画テーマの需要が証明されている典型例");
  }

  return reasons.slice(0, 4).map((r, i) => `${i + 1}. ${r}`).join("\n");
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
    parts.push(`冒頭フック：「${hooks.slice(0, 3).join("」「")}」系`);
  }
  const sentiment = detectSentiment(content);
  const sentimentLabel = {
    bullish: "上昇・買い寄りトーン",
    bearish: "下落・恐怖喚起トーン",
    neutral: "中立・解説寄り",
    mixed: "上昇と下落の両方を提示",
  }[sentiment];
  parts.push(sentimentLabel);
  if (planningMatch.length) {
    parts.push(`企画キーワード一致：${planningMatch.slice(0, 3).join("・")}`);
  }

  return parts.join(" ｜ ");
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
      "【海外動画】英語圏の切り口・データを日本向けに翻訳・日常例えで差別化できる"
    );
  } else if (!video.title.match(/日本|円|NISA|物価/i)) {
    memos.push("競合が触れていない日本市場・国内利用者目線を目玉にできる");
  }

  return memos.slice(0, 4);
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
  const rawContent =
    video.transcript?.trim() ||
    video.description?.trim() ||
    video.title;
  const cleanedContent = cleanContentText(rawContent);
  const contentSource: YouTubeVideoAnalysis["contentSource"] = video.transcript
    ? "transcript"
    : video.description
      ? "description"
      : "title_only";

  const mentionedPrices = extractPrices(cleanedContent);
  const sentiment = detectSentiment(cleanedContent);
  const keyPoints = extractKeyPoints(cleanedContent);
  const excerpt = cleanedContent.slice(0, 600);

  const structureAnalysis = keyPoints.length
    ? keyPoints
    : cleanedContent
        .split(/\n/)
        .filter((l) => l.trim().length > 25 && !isPromoLine(l))
        .slice(0, 5)
        .map((l) => l.trim().slice(0, 120));

  const contentOverview = buildContentOverview(
    video,
    cleanedContent,
    keyPoints,
    contentSource
  );
  const whyPerformingWell = buildWhyPerformingWell(
    video,
    cleanedContent,
    sentiment,
    planning
  );

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
    hookAnalysis: buildHookAnalysis(video, cleanedContent, planning),
    structureAnalysis,
    differentiationMemo: buildDifferentiationMemo(video, planning),
    contentOverview,
    whyPerformingWell,
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
