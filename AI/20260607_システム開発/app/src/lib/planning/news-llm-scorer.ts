import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { callLlm } from "@/lib/llm/provider";
import type { NewsItem } from "@/lib/collectors/news-rss";
import type { PlanningContext } from "./context";

export interface LlmNewsScore {
  impactScore: number;    // 0-20
  relevanceScore: number; // 0-60
  reason?: string;
}

interface LlmResponseItem {
  id: number;
  impact: number;
  relevance: number;
  reason?: string;
}

/** planning context の内容からハッシュを生成（キャッシュキー用） */
function buildPlanningHash(planning: PlanningContext): string {
  const raw = [
    planning.thumbnailText,
    planning.titleText,
    planning.storyHypothesis,
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/** キャッシュ未命中のアイテムのみ LLM で採点し、DB にキャッシュして返す */
export async function scoreNewsWithLlm(
  news: NewsItem[],
  planning: PlanningContext
): Promise<Map<string, LlmNewsScore>> {
  const result = new Map<string, LlmNewsScore>();
  if (!news.length) return result;

  const planningHash = buildPlanningHash(planning);
  const urls = news.map((n) => n.url).filter(Boolean) as string[];

  // --- キャッシュ確認 ---
  const cached = await prisma.newsLlmScore.findMany({
    where: {
      newsUrl: { in: urls },
      planningHash,
    },
  });

  const cachedUrls = new Set(cached.map((c) => c.newsUrl));
  for (const c of cached) {
    result.set(c.newsUrl, {
      impactScore: c.impactScore,
      relevanceScore: c.relevanceScore,
      reason: c.reason ?? undefined,
    });
  }

  // --- 未キャッシュのアイテムを LLM で採点 ---
  const uncached = news.filter((n) => n.url && !cachedUrls.has(n.url));
  if (!uncached.length) return result;

  const scores = await callLlmJudge(uncached, planning);

  // DB に保存
  const toCreate = uncached
    .map((item, i) => {
      const score = scores.get(i + 1);
      if (!score || !item.url) return null;
      return {
        newsUrl: item.url,
        planningHash,
        impactScore: score.impactScore,
        relevanceScore: score.relevanceScore,
        reason: score.reason ?? null,
      };
    })
    .filter(Boolean) as {
      newsUrl: string;
      planningHash: string;
      impactScore: number;
      relevanceScore: number;
      reason: string | null;
    }[];

  if (toCreate.length) {
    await prisma.newsLlmScore.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
  }

  for (const item of uncached) {
    const idx = uncached.indexOf(item) + 1;
    const score = scores.get(idx);
    if (score && item.url) {
      result.set(item.url, score);
    }
  }

  return result;
}

async function callLlmJudge(
  news: NewsItem[],
  planning: PlanningContext
): Promise<Map<number, LlmNewsScore>> {
  const fallback = buildFallbackScores(news);

  const planningLines = [
    planning.thumbnailText ? `・サムネ：${planning.thumbnailText}` : null,
    planning.titleText ? `・タイトル：${planning.titleText}` : null,
    planning.storyHypothesis ? `・台本の方向性：${planning.storyHypothesis}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (!planningLines) return fallback;

  const newsList = news
    .map((item, i) => {
      const summary = (item.summary || item.title).slice(0, 150);
      return `${i + 1}. ${item.title} — ${summary}`;
    })
    .join("\n");

  const systemPrompt = `あなたはクリプト系YouTubeチャンネルのリサーチャーです。
提供された動画企画情報を基に、各ニュースを2軸で採点してください。
必ずJSONのみで回答し、前後に説明文・コードブロックは一切入れないでください。`;

  const userPrompt = `【動画企画】
${planningLines}

【採点対象ニュース】
${newsList}

【採点基準】
A. 市場インパクト（0-20点）：大企業・国家・規制当局の動き、巨額資金移動、急騰/急落の事実が含まれるか
B. 台本への貢献度（0-60点）：動画企画の根拠・エビデンスとして直接使えるか（キーワード一致ではなく文脈の一致を重視）

【出力形式（JSONのみ・他は不要）】
[{"id":1,"impact":15,"relevance":50,"reason":"理由20文字以内"},...]`;

  try {
    const raw = await callLlm(systemPrompt, userPrompt);
    return parseLlmResponse(raw, news.length);
  } catch {
    return fallback;
  }
}

function parseLlmResponse(raw: string, count: number): Map<number, LlmNewsScore> {
  const result = new Map<number, LlmNewsScore>();
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return buildFallbackScoresFromCount(count);

    const parsed = JSON.parse(match[0]) as LlmResponseItem[];
    for (const item of parsed) {
      if (typeof item.id !== "number") continue;
      result.set(item.id, {
        impactScore: clamp(Number(item.impact) || 0, 0, 20),
        relevanceScore: clamp(Number(item.relevance) || 0, 0, 60),
        reason: typeof item.reason === "string" ? item.reason : undefined,
      });
    }
    return result;
  } catch {
    return buildFallbackScoresFromCount(count);
  }
}

function buildFallbackScores(news: NewsItem[]): Map<number, LlmNewsScore> {
  return buildFallbackScoresFromCount(news.length);
}

function buildFallbackScoresFromCount(count: number): Map<number, LlmNewsScore> {
  const result = new Map<number, LlmNewsScore>();
  for (let i = 1; i <= count; i++) {
    result.set(i, { impactScore: 10, relevanceScore: 30 });
  }
  return result;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
