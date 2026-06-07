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
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  keyLevels: KeyLevel[];
  trendReversalCondition: string;
  candleCharacteristics: string;
  volumeSpike: boolean;
  marketPhase: MarketPhase;
  marketPhaseLabel: string;
  phaseReasons: string[];
  confluence: ConfluenceAnalysis;
  scenarios: {
    bullish: TradeScenario;
    bearish: TradeScenario;
  };
  conceptSuggestion: {
    name: string;
    reason: string;
    phase: MarketPhase;
  };
}

export interface TradeScenario {
  trigger: string;
  entry: string;
  stopLoss: string;
  takeProfit1: string;
  takeProfit2: string;
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
