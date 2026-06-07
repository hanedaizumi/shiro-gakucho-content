import type { NewsItem } from "@/lib/collectors/news-rss";
import type { YouTubeVideoAnalysis } from "@/lib/collectors/youtube-analyzer";
import {
  extractPlanningKeywords,
  scorePlanningRelevance,
  type PlanningContext,
} from "./context";

export const NEWS_COLLECT_LIMIT = 40;
export const NEWS_OUTPUT_LIMIT = 5;
export const YOUTUBE_COLLECT_LIMIT = 10;
export const YOUTUBE_OUTPUT_DOMESTIC = 3;
export const YOUTUBE_OUTPUT_INTERNATIONAL = 2;

export interface RankedNewsItem {
  item: NewsItem;
  rankScore: number;
  planningScore: number;
  freshnessScore: number;
}

function newsFreshnessScore(publishedAt: string): number {
  const ageDays =
    (Date.now() - new Date(publishedAt).getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays <= 14) return 3;
  if (ageDays <= 30) return 2;
  if (ageDays <= 90) return 1;
  return 0;
}

export function rankNewsForScript(
  news: NewsItem[],
  planning: PlanningContext,
  coinKeywords: string[]
): RankedNewsItem[] {
  const planningKw = extractPlanningKeywords(planning);

  return news
    .map((item) => {
      const body = `${item.title} ${item.summary}`;
      const planningScore = scorePlanningRelevance(body, planningKw);
      const coinScore = coinKeywords.filter((kw) =>
        body.toLowerCase().includes(kw.toLowerCase())
      ).length;
      const freshnessScore = newsFreshnessScore(item.publishedAt);
      const rankScore = planningScore * 3 + coinScore + freshnessScore;

      return { item, rankScore, planningScore, freshnessScore };
    })
    .sort((a, b) => {
      if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
      return (
        new Date(b.item.publishedAt).getTime() -
        new Date(a.item.publishedAt).getTime()
      );
    });
}

export function selectTopNews(
  news: NewsItem[],
  planning: PlanningContext,
  coinKeywords: string[],
  limit = NEWS_OUTPUT_LIMIT
): RankedNewsItem[] {
  return rankNewsForScript(news, planning, coinKeywords).slice(0, limit);
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
