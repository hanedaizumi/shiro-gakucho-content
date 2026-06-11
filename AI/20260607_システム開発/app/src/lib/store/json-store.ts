import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type {
  ConceptLog,
  Database,
  JobStatus,
  MarketSnapshot,
  NewsLlmScore,
  Report,
  ResearchJob,
  Script,
  ScriptHistory,
  SourceDocument,
} from "./types";
import { gcsRead, gcsWrite, getGcsConfig } from "./gcs-backend";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "store.json");

function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function now(): string {
  return new Date().toISOString();
}

async function loadDb(): Promise<Database> {
  const gcs = getGcsConfig();

  // GCS が設定されている場合は GCS を優先して読み込む
  if (gcs) {
    try {
      const remote = await gcsRead(gcs.bucket, gcs.object);
      if (remote) {
        const db = ensureDb(JSON.parse(remote) as Database);
        // ローカルにも書き込んでおく（次回の高速アクセス用）
        await mkdir(DATA_DIR, { recursive: true }).catch(() => {});
        await writeFile(DB_FILE, remote, "utf-8").catch(() => {});
        return db;
      }
    } catch {
      // GCS 読み込み失敗時はローカルファイルにフォールバック
    }
  }

  // ローカルファイルから読み込む
  try {
    const raw = await readFile(DB_FILE, "utf-8");
    return ensureDb(JSON.parse(raw) as Database);
  } catch {
    return {
      jobs: [],
      sources: [],
      snapshots: [],
      reports: [],
      scripts: [],
      scriptHistory: [],
      newsLlmScores: [],
      conceptLog: [],
    };
  }
}

function ensureDb(db: Database): Database {
  if (!db.newsLlmScores) db.newsLlmScores = [];
  if (!db.scriptHistory) db.scriptHistory = [];
  if (!db.conceptLog) db.conceptLog = [];
  return db;
}

async function saveDb(db: Database): Promise<void> {
  const content = JSON.stringify(db, null, 2);

  // ローカルファイルに書き込む
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DB_FILE, content, "utf-8");

  // GCS が設定されている場合は非同期で GCS にも書き込む（エラーは無視）
  const gcs = getGcsConfig();
  if (gcs) {
    gcsWrite(gcs.bucket, gcs.object, content).catch(() => {});
  }
}

export const store = {
  researchJob: {
    async create(args: {
      data: {
        jobType?: ResearchJob["jobType"];
        status?: JobStatus;
        stepMessage?: string | null;
        manualXPosts?: string | null;
        scriptNumber?: number | null;
        coinSymbol?: string | null;
        coinName?: string | null;
        researchMode?: ResearchJob["researchMode"];
        outputMode?: ResearchJob["outputMode"];
        thumbnailText?: string | null;
        titleText?: string | null;
        storyHypothesis?: string | null;
      };
    }): Promise<ResearchJob> {
      const db = await loadDb();
      const job: ResearchJob = {
        id: cuid(),
        jobType: args.data.jobType ?? "unified_research",
        status: args.data.status ?? "pending",
        stepMessage: args.data.stepMessage ?? null,
        manualXPosts: args.data.manualXPosts ?? null,
        scriptNumber: args.data.scriptNumber ?? null,
        coinSymbol: args.data.coinSymbol ?? null,
        coinName: args.data.coinName ?? null,
        researchMode: args.data.researchMode ?? null,
        outputMode: args.data.outputMode ?? null,
        thumbnailText: args.data.thumbnailText ?? null,
        titleText: args.data.titleText ?? null,
        storyHypothesis: args.data.storyHypothesis ?? null,
        startedAt: now(),
      };
      db.jobs.unshift(job);
      await saveDb(db);
      return job;
    },

    async update(args: {
      where: { id: string };
      data: Partial<ResearchJob>;
    }): Promise<ResearchJob> {
      const db = await loadDb();
      const idx = db.jobs.findIndex((j) => j.id === args.where.id);
      if (idx < 0) throw new Error(`Job not found: ${args.where.id}`);
      db.jobs[idx] = { ...db.jobs[idx], ...args.data };
      await saveDb(db);
      return db.jobs[idx];
    },

    async findMany(args?: {
      orderBy?: { startedAt: "desc" };
      take?: number;
      include?: { report?: { select: { id: true } }; script?: { select: { id: true; charCount: true } } };
    }) {
      const db = await loadDb();
      let jobs = [...db.jobs];
      if (args?.orderBy?.startedAt === "desc") {
        jobs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      }
      if (args?.take) jobs = jobs.slice(0, args.take);

      return jobs.map((job) => ({
        ...job,
        report: args?.include?.report
          ? db.reports.find((r) => r.jobId === job.id)
            ? { id: db.reports.find((r) => r.jobId === job.id)!.id }
            : null
          : undefined,
        script: args?.include?.script
          ? (() => {
              const s = db.scripts.find((x) => x.jobId === job.id);
              return s ? { id: s.id, charCount: s.charCount } : null;
            })()
          : undefined,
      }));
    },

    async findUnique(args: {
      where: { id: string };
      include?: {
        report?: boolean;
        script?: boolean;
        snapshots?: boolean;
        sources?: { take?: number };
      };
    }) {
      const db = await loadDb();
      const job = db.jobs.find((j) => j.id === args.where.id);
      if (!job) return null;

      return {
        ...job,
        report: args.include?.report
          ? db.reports.find((r) => r.jobId === job.id) ?? null
          : undefined,
        script: args.include?.script
          ? db.scripts.find((s) => s.jobId === job.id) ?? null
          : undefined,
        snapshots: args.include?.snapshots
          ? db.snapshots.filter((s) => s.jobId === job.id)
          : undefined,
        sources: args.include?.sources
          ? db.sources.filter((s) => s.jobId === job.id).slice(0, args.include.sources.take ?? 100)
          : undefined,
      };
    },

    async delete(args: { where: { id: string } }): Promise<boolean> {
      const db = await loadDb();
      const idx = db.jobs.findIndex((j) => j.id === args.where.id);
      if (idx < 0) return false;

      const jobId = args.where.id;
      db.jobs.splice(idx, 1);
      db.sources = db.sources.filter((s) => s.jobId !== jobId);
      db.snapshots = db.snapshots.filter((s) => s.jobId !== jobId);
      db.reports = db.reports.filter((r) => r.jobId !== jobId);
      db.scripts = db.scripts.filter((s) => s.jobId !== jobId);
      await saveDb(db);
      return true;
    },
  },

  sourceDocument: {
    async createMany(args: { data: Array<Omit<SourceDocument, "id" | "fetchedAt">> }) {
      const db = await loadDb();
      for (const item of args.data) {
        db.sources.push({
          id: cuid(),
          fetchedAt: now(),
          ...item,
        });
      }
      await saveDb(db);
    },
  },

  marketSnapshot: {
    async createMany(args: { data: Array<Omit<MarketSnapshot, "id" | "createdAt">> }) {
      const db = await loadDb();
      for (const item of args.data) {
        db.snapshots.push({
          id: cuid(),
          createdAt: now(),
          ...item,
        });
      }
      await saveDb(db);
    },
  },

  report: {
    async create(args: { data: { jobId: string; markdown: string; json: unknown } }): Promise<Report> {
      const db = await loadDb();
      const ts = now();
      const report: Report = {
        id: cuid(),
        jobId: args.data.jobId,
        markdown: args.data.markdown,
        json: args.data.json,
        createdAt: ts,
        updatedAt: ts,
      };
      db.reports.push(report);
      await saveDb(db);
      return report;
    },

    async update(args: { where: { jobId: string }; data: { markdown: string } }) {
      const db = await loadDb();
      const idx = db.reports.findIndex((r) => r.jobId === args.where.jobId);
      if (idx < 0) throw new Error("Report not found");
      db.reports[idx].markdown = args.data.markdown;
      db.reports[idx].updatedAt = now();
      await saveDb(db);
      return db.reports[idx];
    },
  },

  script: {
    async create(args: {
      data: {
        jobId: string;
        markdown: string;
        episodeUsed?: string | null;
        conceptUsed?: string | null;
        validation: unknown;
        charCount: number;
      };
    }): Promise<Script> {
      const db = await loadDb();
      const ts = now();
      const script: Script = {
        id: cuid(),
        jobId: args.data.jobId,
        markdown: args.data.markdown,
        episodeUsed: args.data.episodeUsed ?? null,
        conceptUsed: args.data.conceptUsed ?? null,
        validation: args.data.validation,
        charCount: args.data.charCount,
        createdAt: ts,
        updatedAt: ts,
      };
      db.scripts.push(script);
      await saveDb(db);
      return script;
    },

    async findUnique(args: { where: { jobId: string } }) {
      const db = await loadDb();
      return db.scripts.find((s) => s.jobId === args.where.jobId) ?? null;
    },

    async update(args: {
      where: { jobId: string };
      data: {
        markdown: string;
        charCount: number;
        validation?: unknown;
      };
    }) {
      const db = await loadDb();
      const idx = db.scripts.findIndex((s) => s.jobId === args.where.jobId);
      if (idx < 0) throw new Error("Script not found");
      db.scripts[idx].markdown = args.data.markdown;
      db.scripts[idx].charCount = args.data.charCount;
      if (args.data.validation !== undefined) {
        db.scripts[idx].validation = args.data.validation;
      }
      db.scripts[idx].updatedAt = now();
      await saveDb(db);
      return db.scripts[idx];
    },
  },

  newsLlmScore: {
    async findMany(args: {
      where: { newsUrl: { in: string[] }; planningHash: string };
    }): Promise<NewsLlmScore[]> {
      const db = await loadDb();
      const urls = new Set(args.where.newsUrl.in);
      return db.newsLlmScores.filter(
        (s) => urls.has(s.newsUrl) && s.planningHash === args.where.planningHash
      );
    },

    async createMany(args: {
      data: Array<Omit<NewsLlmScore, "id" | "createdAt">>;
      skipDuplicates?: boolean;
    }): Promise<void> {
      const db = await loadDb();
      for (const item of args.data) {
        const exists = db.newsLlmScores.some(
          (s) => s.newsUrl === item.newsUrl && s.planningHash === item.planningHash
        );
        if (args.skipDuplicates && exists) continue;
        if (!exists) {
          db.newsLlmScores.push({
            id: cuid(),
            createdAt: now(),
            ...item,
          });
        }
      }
      await saveDb(db);
    },
  },

  conceptLog: {
    async findMany(): Promise<ConceptLog[]> {
      const db = await loadDb();
      return [...db.conceptLog].sort((a, b) => b.date.localeCompare(a.date));
    },

    /**
     * 使用した概念を記録する。
     * 同じ台本番号（または番号なしなら同じ日付）の既存エントリは上書きするため、
     * 同じレポートを再生成しても履歴が増殖しない。
     */
    async record(args: {
      name: string;
      scriptNumber?: number | null;
    }): Promise<ConceptLog> {
      const db = await loadDb();
      const today = new Date().toISOString().split("T")[0];

      const idx = db.conceptLog.findIndex((e) =>
        args.scriptNumber != null
          ? e.scriptNumber === args.scriptNumber
          : e.scriptNumber == null && e.date === today
      );

      if (idx >= 0) {
        db.conceptLog[idx] = {
          ...db.conceptLog[idx],
          name: args.name,
          date: today,
        };
        await saveDb(db);
        return db.conceptLog[idx];
      }

      const entry: ConceptLog = {
        id: cuid(),
        name: args.name,
        scriptNumber: args.scriptNumber ?? null,
        date: today,
        createdAt: now(),
      };
      db.conceptLog.push(entry);
      await saveDb(db);
      return entry;
    },
  },

  scriptHistory: {
    async findMany(args?: { orderBy?: { scriptNumber: "desc" }; take?: number }) {
      const db = await loadDb();
      let items = [...db.scriptHistory];
      if (args?.orderBy?.scriptNumber === "desc") {
        items.sort((a, b) => b.scriptNumber - a.scriptNumber);
      }
      if (args?.take) items = items.slice(0, args.take);
      return items;
    },

    async findFirst(args?: { orderBy?: { scriptNumber: "desc" } }) {
      const items = await this.findMany({
        orderBy: args?.orderBy,
        take: 1,
      });
      return items[0] ?? null;
    },

    async upsert(args: {
      where: { scriptNumber: number };
      create: Omit<ScriptHistory, "id" | "createdAt">;
      update: Partial<Omit<ScriptHistory, "id" | "scriptNumber" | "createdAt">>;
    }) {
      const db = await loadDb();
      const idx = db.scriptHistory.findIndex(
        (h) => h.scriptNumber === args.where.scriptNumber
      );
      if (idx >= 0) {
        db.scriptHistory[idx] = {
          ...db.scriptHistory[idx],
          ...args.update,
        };
        await saveDb(db);
        return db.scriptHistory[idx];
      }
      const entry: ScriptHistory = {
        id: cuid(),
        createdAt: now(),
        ...args.create,
      };
      db.scriptHistory.push(entry);
      await saveDb(db);
      return entry;
    },
  },
};
