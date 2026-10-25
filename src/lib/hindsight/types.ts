import { Candle, TimeframeCode } from "../shared-types/interop";
import { CandlestickPatternType } from "../indicators/candlestickPatterns";

export type IndicatorAtomType =
  | "price_near_ma"          // Price within [minPct, maxPct] of MA (EMA/MA 5~250), approachFrom: "above" | "below"
  | "ma_hold_or_reclaim"     // Breaks below MA then reclaims within N bars
  | "ma_consecutive_break"   // Closes below MA for consecutive N bars
  | "ma_slope_direction"     // MA slope is up or down
  | "kdj_zone_or_cross"      // KDJ J/K/D extreme zone (J < 0, J < 10, J > 100) or cross
  | "rsi_zone"               // RSI oversold (<30) or overbought (>70)
  | "macd_state"             // MACD golden cross / death cross / hist turnaround / divergence
  | "candlestick_pattern"    // Candlestick pattern: hammer, long_lower_shadow, bullish_engulfing, etc.
  | "fib_retracement_near"   // Near Fibonacci 0.382 / 0.5 / 0.618 / 0.786
  | "vpvr_zone_near"         // Near VPVR POC / VAL / VAH
  | "volume_ratio";          // Volume ratio to 20-MA (e.g. < 0.7 or > 1.5)

export interface ConditionAtom {
  type: IndicatorAtomType;
  params: Record<string, number | string | boolean>;
}

export interface HindsightHypothesis {
  id: string;
  category: "bullish_entry" | "support_hold" | "breakdown_risk" | "bearish_peak";
  title: string;
  conditions: ConditionAtom[];
  aiRationale: string;
}

export interface SwingSegment {
  startIndex: number;
  startDate: string;
  startPrice: number;
  peakIndex: number;
  peakDate: string;
  peakPrice: number;
  gainPct: number;
  durationBars: number;
  isWin: boolean;
}

export interface TimelineFeatures {
  date: string;
  close: number;
  high: number;
  low: number;
  volume: number;
  // Moving averages
  mas: Record<string, number>; // e.g. "EMA5", "EMA20", "EMA60", "MA20"
  maDistancesPct: Record<string, number>; // (close - ma) / ma * 100
  maSlopes: Record<string, "up" | "down" | "flat">;
  consecutiveBarsBelow: Record<string, number>;
  // Oscillators
  kdj: { k: number; d: number; j: number };
  kdjCross: "golden" | "death" | "none";
  rsi: number;
  macd: { dif: number; dea: number; hist: number };
  macdCross: "golden" | "death" | "none";
  macdDivergence: "bottom" | "top" | "none";
  // Patterns
  candlestickPatterns: Set<CandlestickPatternType>;
  // Structure
  fibLevels: Array<{ ratio: number; price: number; distancePct: number }>;
  vpvr: { poc: number; val: number; vah: number; distPocPct: number } | null;
  volumeRatio20: number;
}

export interface EvaluationResult {
  hypothesis: HindsightHypothesis;
  triggerCount: number;
  winCount: number;
  winRate: number;
  baselineWinRate: number;
  excessWinRate: number;
  oosStatus: "oos_validated" | "oos_untested" | "oos_degraded";
  oosTriggerCount: number;
  oosWinCount: number;
  oosWinRate: number;
  status: "high_confidence" | "insufficient_sample" | "degraded";
  triggeredIndices: number[];
  winningIndices: number[];
  averageGainPct: number;
}

export interface SupportResistanceStat {
  levelKey: string;
  approachFrom: "above" | "below";
  totalTouches: number;
  holds: number;
  holdRate: number;
  falseBreakdowns: number;
  falseBreakdownRate: number;
  trueBreakdowns: number;
  trueBreakdownRate: number;
  maxPierceDepthPct80: number;
  medianPierceDepthPct: number;
}
