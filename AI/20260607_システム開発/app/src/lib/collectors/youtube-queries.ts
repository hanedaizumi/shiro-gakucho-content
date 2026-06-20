import type { ResolvedCoin } from "@/lib/coins/resolver";
import {
  extractPlanningKeywords,
  type PlanningContext,
} from "@/lib/planning/context";

function unique(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

function isEnglishQuery(q: string): boolean {
  const jaChars = (q.match(/[\u3040-\u9fff]/g) ?? []).length;
  return jaChars === 0 && /[a-zA-Z]/.test(q);
}

/** コイン＋企画から YouTube 検索クエリを生成（日本語＋英語） */
export function buildYouTubeSearchQueries(
  coin: ResolvedCoin,
  planning: PlanningContext
): { ja: string[]; en: string[] } {
  const pk = extractPlanningKeywords(planning);
  const sym = coin.symbol;
  const name = coin.name;

  const presetJa = coin.searchQueries.filter((q) => !isEnglishQuery(q));
  const presetEn = coin.searchQueries.filter((q) => isEnglishQuery(q));

  const ja = unique([
    ...presetJa,
    `${name} ${sym}`,
    `${name} 仮想通貨`,
    `${sym} 仮想通貨 解説`,
    `${name} 最新 ニュース`,
    ...pk.slice(0, 5).map((k) => `${name} ${k}`),
    ...pk.slice(0, 3).map((k) => `${sym} ${k}`),
  ]);

  const en = unique([
    ...presetEn,
    `${sym} analysis`,
    `${sym} crypto news`,
    `${sym} price prediction`,
    `${sym} ETF`,
    `${sym} technical analysis`,
    `${sym} explained`,
    ...pk.slice(0, 4).map((k) => `${sym} ${k}`),
    ...pk.filter((k) => /^[A-Za-z]/.test(k)).slice(0, 3).map((k) => `${sym} ${k}`),
  ]);

  return { ja, en };
}

export const YOUTUBE_MAX_AGE_DAYS = 180;
export const YOUTUBE_MAX_AGE_HOURS = YOUTUBE_MAX_AGE_DAYS * 24;
