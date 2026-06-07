import { readFile, readdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/analysis";
import { getTechnicalWorkspacePath } from "./workspace";

const KANJI_TO_NUM: Record<string, number> = {
  "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5,
  "⑥": 6, "⑦": 7, "⑧": 8, "⑨": 9, "⑩": 10,
};

export interface PreviousScriptContext {
  scriptNumber: number;
  filename: string;
  content: string;
  predictionQuote: string;
  keyLevels: number[];
  reversalCondition: string | null;
  conceptUsed: string | null;
}

function parseScriptNumberFromFilename(filename: string): number | null {
  const kanji = filename.match(/台本([①②③④⑤⑥⑦⑧⑨⑩])/);
  if (kanji) return KANJI_TO_NUM[kanji[1]] ?? null;
  const digit = filename.match(/台本(\d+)/);
  if (digit) return parseInt(digit[1], 10);
  return null;
}

function extractPredictionQuote(content: string): string {
  const patterns = [
    /前回の動画で[、,\s]*[「「]([^」」\n]+)[」」]/,
    /前回の動画で[^\n]*?([「「][^」」]+[」」])/,
    /前回[^\n]{0,20}お伝えした[^\n]*?([「「][^」」]+[」」])/,
  ];
  for (const p of patterns) {
    const m = content.match(p);
    if (m?.[1]) return m[1].replace(/^[「]|[」]$/g, "").trim();
  }

  const lines = content.split("\n").slice(0, 40);
  const idx = lines.findIndex((l) => l.includes("前回の動画"));
  if (idx >= 0) {
    const chunk = lines.slice(idx, idx + 5).join("\n");
    const quote = chunk.match(/[「「]([^」」]+)[」」]/);
    if (quote) return quote[1].trim();
    return chunk.replace(/\s+/g, " ").trim().slice(0, 200);
  }
  return "";
}

function normalizeKeyLevels(raw: unknown, content: string): number[] {
  if (Array.isArray(raw)) return raw.filter((n) => typeof n === "number");
  if (raw && typeof raw === "object") {
    return Object.values(raw as Record<string, number>).filter((n) => n > 10000);
  }
  return extractKeyLevels(content);
}

function extractKeyLevels(content: string): number[] {
  const found = new Set<number>();
  for (const m of content.matchAll(/(\d{2,3}[,.]?\d{0,3})\s*ドル/g)) {
    const num = parseFloat(m[1].replace(/,/g, ""));
    if (num >= 10000 && num <= 200000) found.add(num);
  }
  return [...found].sort((a, b) => b - a).slice(0, 8);
}

function extractReversalCondition(content: string): string | null {
  const m = content.match(
    /(?:どうなれば|転換|上昇トレンドに転換)[^\n]*\n+([^\n#]+(?:\n[^\n#]+){0,2})/i
  );
  return m?.[1]?.trim().slice(0, 300) ?? null;
}

function extractConcept(content: string): string | null {
  const m = content.match(/⑤[^\n]*[：:]\s*(.+)/);
  return m?.[1]?.trim() ?? null;
}

async function readArchiveScript(
  archiveDir: string,
  targetNumber: number
): Promise<PreviousScriptContext | null> {
  let files: string[] = [];
  try {
    files = await readdir(archiveDir);
  } catch {
    return null;
  }

  for (const f of files) {
    if (!f.match(/台本.*\.md$/)) continue;
    const num = parseScriptNumberFromFilename(f);
    if (num !== targetNumber) continue;

    const content = await readFile(path.join(archiveDir, f), "utf-8");
    if (content.length < 100) continue;

    return {
      scriptNumber: num,
      filename: f,
      content,
      predictionQuote: extractPredictionQuote(content),
      keyLevels: extractKeyLevels(content),
      reversalCondition: extractReversalCondition(content),
      conceptUsed: extractConcept(content),
    };
  }
  return null;
}

export async function loadPreviousScript(
  currentScriptNumber: number
): Promise<PreviousScriptContext | null> {
  const prevNum = currentScriptNumber - 1;
  if (prevNum < 1) return null;

  const ws = getTechnicalWorkspacePath();
  const archiveDir = path.join(ws, "02_アーカイブ", "過去台本");

  const fromArchive = await readArchiveScript(archiveDir, prevNum);
  if (fromArchive) return fromArchive;

  const dbItems = await prisma.scriptHistory.findMany({
    orderBy: { scriptNumber: "desc" },
  });
  const fromDb = dbItems.find((h) => h.scriptNumber === prevNum);
  if (fromDb?.content) {
    return {
      scriptNumber: prevNum,
      filename: fromDb.filename,
      content: fromDb.content,
      predictionQuote: extractPredictionQuote(fromDb.content),
      keyLevels: normalizeKeyLevels(fromDb.keyLevels, fromDb.content),
      reversalCondition: extractReversalCondition(fromDb.content),
      conceptUsed: fromDb.conceptUsed ?? null,
    };
  }

  const inputDir = path.join(ws, "03_YouTube台本", "インプット");
  return readArchiveScript(inputDir, prevNum);
}

function assessPredictionHit(
  prediction: string,
  currentPrice: number,
  trend: string
): { hit: boolean; narrative: string } {
  const levels = [...prediction.matchAll(/(\d{2,3}[,.]?\d{0,3})\s*ドル/g)].map((m) =>
    parseFloat(m[1].replace(/,/g, ""))
  );

  const bearishWords = /下落|急落|割る|ショート|戻り売り|下目線|売り/;
  const bullishWords = /上昇|反発|上抜け|ロング|買い/;

  if (levels.length > 0) {
    const ref = levels[0];
    const brokeSupport = currentPrice < ref * 0.99;
    const brokeResistance = currentPrice > ref * 1.01;

    if (bearishWords.test(prediction) && brokeSupport) {
      return {
        hit: true,
        narrative: `${formatPrice(ref)}ドル付近のラインを割り込み、下落シナリオが展開しました。予測は的中です。`,
      };
    }
    if (bullishWords.test(prediction) && brokeResistance) {
      return {
        hit: true,
        narrative: `${formatPrice(ref)}ドル付近を上抜け、上昇シナリオが展開しました。予測は的中です。`,
      };
    }
    if (bearishWords.test(prediction) && !brokeSupport) {
      return {
        hit: false,
        narrative: `${formatPrice(ref)}ドル付近はまだ維持されており、下落シナリオは保留です。`,
      };
    }
  }

  if (trend === "bearish" && bearishWords.test(prediction)) {
    return { hit: true, narrative: "下落目線どおり、価格は下方向に推移しています。予測はおおむね的中です。" };
  }
  if (trend === "bullish" && bullishWords.test(prediction)) {
    return { hit: true, narrative: "上昇目線どおり、価格は上方向に推移しています。予測はおおむね的中です。" };
  }

  return {
    hit: false,
    narrative: "前回のシナリオはまだ完全には確定していません。引き続き重要ラインを監視します。",
  };
}

export function buildPreviousHitIntro(
  prev: PreviousScriptContext,
  currentPrice: number,
  trend: "bullish" | "bearish" | "neutral"
): string {
  const quote = prev.predictionQuote
    ? `「${prev.predictionQuote}」`
    : "前回お伝えしたシナリオ";

  const assessment = assessPredictionHit(
    prev.predictionQuote || prev.content.slice(0, 500),
    currentPrice,
    trend
  );

  const congrats = assessment.hit
    ? "前回の動画の内容を参考にしてポジションを取れた方、おめでとうございます！"
    : "前回の動画を見ていなかった方は、今日のライン設定から復習しておいてください。";

  return `前回の動画（台本${prev.scriptNumber}）で、
${quote}
とお伝えしました。

そして今、ビットコインは${formatPrice(currentPrice)}ドル付近を推移しています。
${assessment.narrative}

${congrats}

トレードは「知っているか？知らないか？」これだけで大きい差がつきます。
直近の動きを追えていない方は、前回の動画を見返して復習しておいてください。`;
}

export function buildPreviousPredictionReport(
  prev: PreviousScriptContext | null,
  currentPrice: number,
  trend: string,
  reversalCondition: string
): string {
  if (!prev) {
    return "前回台本なし。初回分析として、本日のラインとシナリオを基準にします。";
  }

  const assessment = assessPredictionHit(
    prev.predictionQuote || prev.content.slice(0, 800),
    currentPrice,
    trend
  );

  const levelsLine =
    prev.keyLevels.length > 0
      ? `前回台本（${prev.filename}）で意識したライン: ${prev.keyLevels.slice(0, 4).map((p) => `${formatPrice(p)}ドル`).join("、")}`
      : "";

  return `参照: 台本${prev.scriptNumber}（${prev.filename}）

前回の予測: ${prev.predictionQuote || "（台本本文より抽出）"}

照合結果: ${assessment.narrative}
現在価格: ${formatPrice(currentPrice)}ドル
${levelsLine}

本日の転換条件: ${reversalCondition}`;
}
