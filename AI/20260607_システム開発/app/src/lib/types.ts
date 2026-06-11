export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface SwingPoint {
  price: number;
  type: "high" | "low";
  date: string;
}

export interface KeyLevel {
  price: number;
  type: "support" | "resistance";
  reason: string;
  strength: number;
  /** このライン付近（±1%）で反発・反落したスイングポイントの日付（歴史的検証用） */
  touchDates?: string[];
}

export type MarketPhase =
  | "crash_bottom"
  | "range"
  | "strong_trend_bull"
  | "strong_trend_bear"
  | "reversal";

export interface ConfluenceAnalysis {
  phase: MarketPhase;
  phaseLabel: string;
  phaseReasons: string[];
  structureLayer: {
    summary: string;
    terrain: string;
    dowVerdict: string;
    primarySupport: string;
    primaryResistance: string;
  };
  triggerLayer: {
    concept: string;
    reason: string;
  };
  synthesis: string;
  actionBridge: string;
  eventOverlay: string | null;
}

export interface TechnicalAnalysis {
  currentPrice: number;
  change24h: number;
  change7d: number;
  trend: "bullish" | "bearish" | "neutral";
  trendReasons: string[];
  ma200: number;
  ma200Divergence: number;
  rsiDaily: number;
  rsi4h: number;
  rsi1h: number;
  atr14: number;
  trend4h: "bullish" | "bearish" | "neutral";
  trend1h: "bullish" | "bearish" | "neutral";
  tradingBias: "bullish" | "bearish" | "neutral";
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  keyLevels: KeyLevel[];
  trendReversalCondition: string;
  candleCharacteristics: string;
  candleCharacteristics4h: string;
  candleCharacteristics1h: string;
  volumeSpike: boolean;
  marketPhase: MarketPhase;
  marketPhaseLabel: string;
  phaseReasons: string[];
  confluence: ConfluenceAnalysis;
  scenarios: {
    bullish: TradeScenario;
    bearish: TradeScenario;
    /** 第3シナリオ：トレンド方向へのリテスト狙い（戻り売り/押し目買い） */
    pullback: TradeScenario;
  };
  conceptSuggestion: {
    name: string;
    reason: string;
    phase: MarketPhase;
    definition: string;
    chartApplication: string;
    benefit: string;
    entryBridge: string;
    /** 中学生でも分かる日常の例え */
    analogy: string;
    /** 視聴者がやりがちなNG行動 */
    ngAction: string;
    /** コメント誘導用の二択質問 */
    commentPrompt: string;
  };
}

export interface TradeScenario {
  trigger: string;
  entry: string;
  entryPrice: number;
  stopLoss: string;
  stopLossPrice: number;
  stopLossAmount: number;
  takeProfit1: string;
  takeProfit1Price: number;
  takeProfit1Amount: number;
  takeProfit2: string;
  takeProfit2Price: number;
  takeProfit2Amount: number;
  rrRatio: string;
  notes: string;
}

export interface ReportJson {
  summary: string;
  priceVolatility: Record<string, unknown>;
  marketContext?: Record<string, unknown> | null;
  marketPhase?: Record<string, unknown>;
  confluence?: ConfluenceAnalysis;
  chartAnalysis: Record<string, unknown>;
  weeklyConcept: Record<string, unknown>;
  scenarios: Record<string, unknown>;
  previousPrediction: Record<string, unknown>;
  externalSummary: Record<string, unknown>;
  sources: Array<{ type: string; title: string; url?: string; fetchedAt: string }>;
  technical: TechnicalAnalysis;
}

export interface ValidationResult {
  passed: boolean;
  checks: Array<{
    id: string;
    label: string;
    passed: boolean;
    message?: string;
  }>;
  charCount: number;
  ngWords: string[];
}

export interface JobProgress {
  status: string;
  stepMessage?: string | null;
  errorMessage?: string | null;
}
