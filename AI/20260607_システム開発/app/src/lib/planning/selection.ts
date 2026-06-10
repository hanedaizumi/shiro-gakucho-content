import type { NewsItem } from "@/lib/collectors/news-rss";
import type { YouTubeVideoAnalysis } from "@/lib/collectors/youtube-analyzer";
import {
  extractPlanningKeywords,
  scorePlanningRelevance,
  type PlanningContext,
} from "./context";
import { scoreNewsWithLlm } from "./news-llm-scorer";

export const NEWS_COLLECT_LIMIT = 40;
export const NEWS_OUTPUT_LIMIT = 5;
export const YOUTUBE_COLLECT_LIMIT = 10;
export const YOUTUBE_OUTPUT_DOMESTIC = 3;
export const YOUTUBE_OUTPUT_INTERNATIONAL = 2;

/** ニュースの最大許容経過日数（足切りライン） */
const MAX_NEWS_AGE_DAYS = 90;

export interface RankedNewsItem {
  item: NewsItem;
  /** 総合スコア（100点満点：鮮度20 + インパクト20 + 台本貢献度60） */
  rankScore: number;
  freshnessScore: number;  // 0-20
  impactScore: number;     // 0-20（LLM判定）
  relevanceScore: number;  // 0-60（LLM判定）
  /** 後方互換用：LLM貢献度スコアを正規化した値 */
  planningScore: number;
  llmReason?: string;
}

/**
 * 鮮度スコア（0-20点・なだらかな減衰・90日で足切り）
 */
function newsFreshnessScore(publishedAt: string): number {
  const ageDays =
    (Date.now() - new Date(publishedAt).getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays <= 1) return 20;
  if (ageDays <= 3) return 16;
  if (ageDays <= 7) return 12;
  if (ageDays <= 14) return 8;
  if (ageDays <= 30) return 4;
  if (ageDays <= 60) return 2;
  if (ageDays <= MAX_NEWS_AGE_DAYS) return 1;
  return 0;
}

/**
 * LLM呼び出し前のプログラム足切り：
 * コイン関連キーワードを1つも含まない記事は除外してAPI呼び出しを最小化する
 */
function preFilterForLlm(
  news: NewsItem[],
  coinKeywords: string[],
  planningKw: string[]
): NewsItem[] {
  const allKw = [...coinKeywords, ...planningKw].map((k) => k.toLowerCase());
  return news.filter((item) => {
    const body = `${item.title} ${item.summary}`.toLowerCase();
    return allKw.some((kw) => body.includes(kw));
  });
}

export async function rankNewsForScript(
  news: NewsItem[],
  planning: PlanningContext,
  coinKeywords: string[]
): Promise<RankedNewsItem[]> {
  const planningKw = extractPlanningKeywords(planning);

  // 90日超を除外
  const fresh = news.filter(
    (item) =>
      (Date.now() - new Date(item.publishedAt).getTime()) /
        (24 * 60 * 60 * 1000) <=
      MAX_NEWS_AGE_DAYS
  );

  // LLM前の足切り（コスト削減）
  const candidates = preFilterForLlm(fresh, coinKeywords, planningKw);

  // LLM採点（DBキャッシュ優先）
  const llmScores = await scoreNewsWithLlm(candidates, planning);

  return fresh
    .map((item) => {
      const freshnessScore = newsFreshnessScore(item.publishedAt);
      const llm = item.url ? llmScores.get(item.url) : undefined;

      let impactScore: number;
      let relevanceScore: number;
      let llmReason: string | undefined;

      if (llm) {
        impactScore = llm.impactScore;
        relevanceScore = llm.relevanceScore;
        llmReason = llm.reason;
      } else {
        // LLMスコアなし（足切り対象）：キーワードスコアでフォールバック
        const body = `${item.title} ${item.summary}`;
        const kws = scorePlanningRelevance(body, planningKw);
        const coinHits = coinKeywords.filter((kw) =>
          body.toLowerCase().includes(kw.toLowerCase())
        ).length;
        impactScore = Math.min(coinHits * 4, 20);
        relevanceScore = Math.min(kws * 10, 60);
      }

      const rankScore = freshnessScore + impactScore + relevanceScore;

      return {
        item,
        rankScore,
        freshnessScore,
        impactScore,
        relevanceScore,
        planningScore: Math.round(relevanceScore / 10),
        llmReason,
      };
    })
    .sort((a, b) => {
      if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
      return (
        new Date(b.item.publishedAt).getTime() -
        new Date(a.item.publishedAt).getTime()
      );
    });
}

export async function selectTopNews(
  news: NewsItem[],
  planning: PlanningContext,
  coinKeywords: string[],
  limit = NEWS_OUTPUT_LIMIT
): Promise<RankedNewsItem[]> {
  return (await rankNewsForScript(news, planning, coinKeywords)).slice(0, limit);
}

function scoreYouTubeForScript(
  analysis: YouTubeVideoAnalysis,
  planningKw: string[]
): number {
  const body = `${analysis.title} ${analysis.excerpt} ${analysis.summary}`;
  const planningScore = scorePlanningRelevance(body, planningKw);
  return planningScore * 2 + (analysis.spreadRate ?? 0);
}

export function selectYouTubeForScript(
  analyses: YouTubeVideoAnalysis[],
  planning: PlanningContext,
  opts?: { domestic?: number; international?: number }
): YouTubeVideoAnalysis[] {
  const domesticLimit = opts?.domestic ?? YOUTUBE_OUTPUT_DOMESTIC;
  const intlLimit = opts?.international ?? YOUTUBE_OUTPUT_INTERNATIONAL;
  const totalLimit = domesticLimit + intlLimit;

  const planningKw = extractPlanningKeywords(planning);
  const scored = analyses.map((a) => ({
    analysis: a,
    score: scoreYouTubeForScript(a, planningKw),
  }));

  const domestic = scored
    .filter((s) => !s.analysis.isInternational)
    .sort((a, b) => b.score - a.score);
  const intl = scored
    .filter((s) => s.analysis.isInternational)
    .sort((a, b) => b.score - a.score);

  const picked: YouTubeVideoAnalysis[] = [];
  const pickedIds = new Set<string>();

  for (const s of domestic.slice(0, domesticLimit)) {
    picked.push(s.analysis);
    pickedIds.add(s.analysis.videoId);
  }
  for (const s of intl.slice(0, intlLimit)) {
    picked.push(s.analysis);
    pickedIds.add(s.analysis.videoId);
  }

  if (picked.length < totalLimit) {
    const rest = scored
      .filter((s) => !pickedIds.has(s.analysis.videoId))
      .sort((a, b) => b.score - a.score);
    for (const s of rest) {
      if (picked.length >= totalLimit) break;
      picked.push(s.analysis);
      pickedIds.add(s.analysis.videoId);
    }
  }

  const domesticPicked = picked.filter((a) => !a.isInternational);
  const intlPicked = picked.filter((a) => a.isInternational);

  return [...domesticPicked, ...intlPicked].slice(0, totalLimit);
}
