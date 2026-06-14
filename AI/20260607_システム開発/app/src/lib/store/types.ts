export type JobStatus =
  | "pending"
  | "collecting"
  | "analyzing"
  | "report_generating"
  | "report_ready"
  | "script_generating"
  | "script_ready"
  | "failed";

export type JobType = "unified_research";
export type CoinResearchMode = "fundamentals" | "technical" | "both";
export type OutputMode = "report" | "script" | "report_and_script";

export interface ResearchJob {
  id: string;
  jobType?: JobType;
  status: JobStatus;
  stepMessage?: string | null;
  scriptNumber?: number | null;
  coinSymbol?: string | null;
  coinName?: string | null;
  researchMode?: CoinResearchMode | null;
  outputMode?: OutputMode | null;
  thumbnailText?: string | null;
  titleText?: string | null;
  storyHypothesis?: string | null;
  startedAt: string;
  completedAt?: string | null;
  errorMessage?: string | null;
  manualXPosts?: string | null;
}

export interface NewsLlmScore {
  id: string;
  newsUrl: string;
  planningHash: string;
  impactScore: number;
  relevanceScore: number;
  reason?: string | null;
  summary?: string | null;
  createdAt: string;
}

export interface SourceDocument {
  id: string;
  jobId: string;
  type: string;
  title?: string | null;
  url?: string | null;
  content: string;
  fetchedAt: string;
}

export interface MarketSnapshot {
  id: string;
  jobId: string;
  timeframe: string;
  price: number;
  rsi?: number | null;
  ma200?: number | null;
  divergence?: number | null;
  rawJson: unknown;
  createdAt: string;
}

export interface Report {
  id: string;
  jobId: string;
  markdown: string;
  json: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface Script {
  id: string;
  jobId: string;
  markdown: string;
  episodeUsed?: string | null;
  conceptUsed?: string | null;
  validation: unknown;
  charCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptHistory {
  id: string;
  scriptNumber: number;
  filename: string;
  conceptUsed?: string | null;
  episodeUsed?: string | null;
  keyLevels: unknown;
  content?: string | null;
  publishedAt?: string | null;
  createdAt: string;
}

/** ⑤で取り上げた概念の履歴（重複防止用） */
export interface ConceptLog {
  id: string;
  /** 概念名（例: "RSIダイバージェンスと清算の連鎖"） */
  name: string;
  /** 紐づく台本番号（あれば）。同じ番号での再生成時は上書きされる */
  scriptNumber?: number | null;
  /** 使用日（YYYY-MM-DD）。台本番号なしの場合は同日再生成で上書き */
  date: string;
  createdAt: string;
}

export interface Database {
  jobs: ResearchJob[];
  sources: SourceDocument[];
  snapshots: MarketSnapshot[];
  reports: Report[];
  scripts: Script[];
  scriptHistory: ScriptHistory[];
  newsLlmScores: NewsLlmScore[];
  conceptLog: ConceptLog[];
}
