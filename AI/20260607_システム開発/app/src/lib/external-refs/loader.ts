import { readFile, readdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";

export interface ExternalContext {
  persona: string;
  channelRules: string;
  scriptCreationSkill: string;
  recentScripts: Array<{ filename: string; content: string; scriptNumber?: number }>;
  usedConcepts: string[];
  usedEpisodes: string[];
  previousPrediction: Record<string, unknown>;
}

function getTechnicalWorkspacePath(): string {
  const configured = process.env.TECHNICAL_WORKSPACE_PATH;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), "..", "..", "..", "シロ学長テクニカル");
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
  const m = content.match(/⑤[^\n]*[：:]\s*(.+)/);
  return m?.[1]?.trim() ?? null;
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

function extractKeyLevels(content: string): Record<string, number> {
  const levels: Record<string, number> = {};
  const matches = content.matchAll(/(\d{2,3}[,.]?\d{0,3})\s*ドル/g);
  for (const m of matches) {
    const num = parseFloat(m[1].replace(/,/g, ""));
    if (num > 10000 && num < 200000) {
      levels[`level_${Object.keys(levels).length}`] = num;
    }
  }
  return levels;
}

export async function loadExternalContext(): Promise<ExternalContext> {
  const ws = getTechnicalWorkspacePath();

  const [persona, channelRules, scriptSkill] = await Promise.all([
    readIfExists(path.join(ws, "03_YouTube台本", "インプット", "persona_technical.md")),
    readIfExists(path.join(ws, "00_チャンネル設計前提.md")),
    readIfExists(path.join(ws, ".cursor", "skills", "script-creation", "SKILL.md")),
  ]);

  const inputDir = path.join(ws, "03_YouTube台本", "インプット");
  const archiveDir = path.join(ws, "02_アーカイブ", "過去台本");

  const files = [
    ...(await findScriptFiles(inputDir)),
    ...(await findScriptFiles(archiveDir)),
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
    take: 4,
  });

  const usedConcepts = [
    ...dbHistory.map((h) => h.conceptUsed).filter(Boolean) as string[],
    ...sorted.map((s) => extractConcept(s.content)).filter(Boolean) as string[],
  ];

  const usedEpisodes = [
    ...dbHistory.map((h) => h.episodeUsed).filter(Boolean) as string[],
    ...sorted.map((s) => extractEpisode(s.content)).filter(Boolean) as string[],
  ];

  const latest = sorted[0];
  const previousPrediction = latest
    ? {
        previousScript: latest.filename,
        keyLevels: extractKeyLevels(latest.content),
        summary: "前回動画の予測ラインと現在価格を照合してください",
        latestContentExcerpt: latest.content.slice(0, 2000),
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
  };
}

export async function getNextScriptNumber(): Promise<number> {
  const last = await prisma.scriptHistory.findFirst({
    orderBy: { scriptNumber: "desc" },
  });
  return (last?.scriptNumber ?? 5) + 1;
}

export async function syncScriptHistoryFromFiles(): Promise<number> {
  const ctx = await loadExternalContext();
  let synced = 0;

  for (const script of ctx.recentScripts) {
    const numMatch = script.filename.match(/台本([①②③④⑤⑥⑦⑧⑨⑩\d]+)/);
    let scriptNumber = 0;
    if (numMatch) {
      const raw = numMatch[1];
      const kanjiMap: Record<string, number> = {
        "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5,
        "⑥": 6, "⑦": 7, "⑧": 8, "⑨": 9, "⑩": 10,
      };
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
        keyLevels: extractKeyLevels(script.content),
        content: script.content.slice(0, 50000),
      },
      update: {
        filename: script.filename,
        conceptUsed: extractConcept(script.content),
        episodeUsed: extractEpisode(script.content),
        keyLevels: extractKeyLevels(script.content),
        content: script.content.slice(0, 50000),
      },
    });
    synced++;
  }

  return synced;
}
