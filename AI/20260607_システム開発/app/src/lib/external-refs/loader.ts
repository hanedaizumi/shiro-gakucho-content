import { readFile, readdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { detectConceptsInText } from "@/lib/analysis/phase-concepts";
import {
  loadPreviousScript,
  buildPreviousPredictionReport,
  type PreviousScriptContext,
} from "./previous-script";
import { getTechnicalWorkspacePath } from "./workspace";

export interface ExternalContext {
  persona: string;
  channelRules: string;
  scriptCreationSkill: string;
  recentScripts: Array<{ filename: string; content: string; scriptNumber?: number }>;
  usedConcepts: string[];
  usedEpisodes: string[];
  previousPrediction: Record<string, unknown>;
  previousScript: PreviousScriptContext | null;
  scriptNumber: number;
}

async function readIfExists(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

async function findScriptFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries
      .filter((f) => f.match(/台本.*\.md$/))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function extractConcept(content: string): string | null {
  const patterns = [
    /⑤[^\n]*[：:]\s*(.+)/,
    /今週の重要ポイント[：:]\s*(.+)/,
    /今週の注目(?:インジケーター|ポイント)[：:]\s*(.+)/,
    /②[^\n]*[「『]([^」』]+)[」』]/,
  ];
  for (const p of patterns) {
    const m = content.match(p);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  const detected = detectConceptsInText(content);
  return detected[0] ?? null;
}

function extractAllConcepts(content: string): string[] {
  const fromHeader = extractConcept(content);
  const detected = detectConceptsInText(content);
  return [...new Set([fromHeader, ...detected].filter(Boolean) as string[])];
}

function extractEpisode(content: string): string | null {
  const lines = content.split("\n").slice(0, 30);
  for (const line of lines) {
    if (line.includes("年前") || line.includes("月利") || line.includes("溶かした")) {
      return line.trim();
    }
  }
  return null;
}

export async function getNextScriptNumber(): Promise<number> {
  const last = await prisma.scriptHistory.findFirst({
    orderBy: { scriptNumber: "desc" },
  });
  return (last?.scriptNumber ?? 5) + 1;
}

export async function loadExternalContext(
  scriptNumber?: number
): Promise<ExternalContext> {
  const ws = getTechnicalWorkspacePath();
  const resolvedScriptNumber = scriptNumber ?? (await getNextScriptNumber());

  const [persona, channelRules, scriptSkill] = await Promise.all([
    readIfExists(path.join(ws, "03_YouTube台本", "インプット", "persona_technical.md")),
    readIfExists(path.join(ws, "00_チャンネル設計前提.md")),
    readIfExists(path.join(ws, ".cursor", "skills", "script-creation", "SKILL.md")),
  ]);

  const archiveDir = path.join(ws, "02_アーカイブ", "過去台本");
  const inputDir = path.join(ws, "03_YouTube台本", "インプット");
  const outputDir = path.join(ws, "03_YouTube台本", "アウトプット");

  const files = [
    ...(await findScriptFiles(archiveDir)),
    ...(await findScriptFiles(inputDir)),
    ...(await findScriptFiles(outputDir)),
  ];

  const scriptsWithContent = await Promise.all(
    files.map(async (f) => ({
      filename: path.basename(f),
      content: await readIfExists(f),
    }))
  );

  const sorted = scriptsWithContent
    .filter((s) => s.content.length > 100)
    .sort((a, b) => b.filename.localeCompare(a.filename))
    .slice(0, 3);

  const dbHistory = await prisma.scriptHistory.findMany({
    orderBy: { scriptNumber: "desc" },
    take: 6,
  });

  const usedConcepts = [
    ...dbHistory.map((h) => h.conceptUsed).filter(Boolean) as string[],
    ...sorted.flatMap((s) => extractAllConcepts(s.content)),
  ];

  const usedEpisodes = [
    ...dbHistory.map((h) => h.episodeUsed).filter(Boolean) as string[],
    ...sorted.map((s) => extractEpisode(s.content)).filter(Boolean) as string[],
  ];

  const previousScript = await loadPreviousScript(resolvedScriptNumber);

  const previousPrediction = previousScript
    ? {
        scriptNumber: previousScript.scriptNumber,
        filename: previousScript.filename,
        predictionQuote: previousScript.predictionQuote,
        keyLevels: previousScript.keyLevels,
        conceptUsed: previousScript.conceptUsed,
        source: `02_アーカイブ/過去台本/${previousScript.filename}`,
        reportText: buildPreviousPredictionReport(
          previousScript,
          0,
          "neutral",
          "（生成時に現在価格で再照合）"
        ),
      }
    : { summary: "前回台本なし。初回分析として扱う" };

  return {
    persona,
    channelRules,
    scriptCreationSkill: scriptSkill,
    recentScripts: sorted,
    usedConcepts: [...new Set(usedConcepts)],
    usedEpisodes: [...new Set(usedEpisodes)],
    previousPrediction,
    previousScript,
    scriptNumber: resolvedScriptNumber,
  };
}

export async function syncScriptHistoryFromFiles(): Promise<number> {
  const ctx = await loadExternalContext();
  let synced = 0;
  const conceptsToPersist: string[] = [];

  const kanjiMap: Record<string, number> = {
    "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5,
    "⑥": 6, "⑦": 7, "⑧": 8, "⑨": 9, "⑩": 10,
  };

  for (const script of ctx.recentScripts) {
    const numMatch = script.filename.match(/台本([①②③④⑤⑥⑦⑧⑨⑩\d]+)/);
    let scriptNumber = 0;
    if (numMatch) {
      const raw = numMatch[1];
      scriptNumber = kanjiMap[raw] ?? parseInt(raw, 10);
    }
    if (!scriptNumber) continue;

    await prisma.scriptHistory.upsert({
      where: { scriptNumber },
      create: {
        scriptNumber,
        filename: script.filename,
        conceptUsed: extractConcept(script.content),
        episodeUsed: extractEpisode(script.content),
        keyLevels: {},
        content: script.content.slice(0, 50000),
      },
      update: {
        filename: script.filename,
        conceptUsed: extractConcept(script.content),
        episodeUsed: extractEpisode(script.content),
        content: script.content.slice(0, 50000),
      },
    });
    conceptsToPersist.push(...extractAllConcepts(script.content));
    synced++;
  }

  if (conceptsToPersist.length) {
    await prisma.conceptLog.ensureMany({
      names: [...new Set(conceptsToPersist)],
    });
  }

  return synced;
}
