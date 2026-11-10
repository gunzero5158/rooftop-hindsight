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

export interface SwingEntryFeatures {
  nearestMa?: string;       // e.g. "EMA60 (-1.2%)"
  kdjJ: number;
  rsi: number;
  volumeRatio20: number;
  macdState?: string;       // e.g. "MACD底背离" | "MACD金叉"
  patterns: string[];       // e.g. ["锤头线", "长下影"]
  matchedTags: string[];    // Concise indicator tags at startup low
}

export interface SwingSegment {
  startIndex: number;
  startDate: string;
  startPrice: number;       // Trough low (ideal, not tradable)
  peakIndex: number;
  peakDate: string;
  peakPrice: number;
  gainPct: number;          // Low-caliber: trough low -> peak high (%)
  closeGainPct?: number;    // Close-caliber: trough-day close -> peak high (%), closer to a real fill
  multiplier?: number;      // peakPrice / startPrice, e.g. 1.25
  durationBars: number;
  isWin: boolean;
  ongoing?: boolean;        // Swing not yet ended structurally at the last bar (gain is a lower bound)
  entryFeatures?: SwingEntryFeatures;
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
  medianGainPct: number;
  maxGainPct: number;
  avgWinGainPct: number;
  avgMultiplier: number;
  maxMultiplier: number;
  avgBarsToPeak: number;
  winRateLowerBound: number;  // Wilson 95% lower bound of win rate
  pValue: number;             // One-sided binomial test vs baseline win rate
  significant: boolean;       // pValue < 0.05
}

/**
 * Forward outcome of one indicator feature over ALL its occurrences (wins and failures),
 * plus a descriptive portrait of how often it appeared at successful swing troughs.
 */
export interface MagnitudeFeatureDriver {
  label: string;
  atom: ConditionAtom;
  occurrenceCount: number;        // Deduplicated triggers in the analysis window
  winRate: number;
  avgForwardGainPct: number;      // From signal-day close, max high within horizon
  medianForwardGainPct: number;
  liftVsBaselinePct: number;      // avgForwardGainPct - baseline average forward gain
  swingHitCount: number;          // Portrait: appeared at trough ±1 bar of successful swings
  swingHitRate: number;
  avgSwingGainWhenPresent: number; // Portrait: low-caliber gain of those swings
}

export interface MagnitudeProfile {
  sampleCount: number;
  lowSampleWarning: boolean;
  // Low-caliber (trough low -> peak)
  avgGainPct: number;
  medianGainPct: number;
  p80GainPct: number;
  maxGainPct: number;
  avgMultiplier: number;
  maxMultiplier: number;
  // Close-caliber (trough-day close -> peak)
  avgCloseGainPct: number;
  medianCloseGainPct: number;
  p80CloseGainPct: number;
  baselineForwardGainPct: number; // Average forward max gain from any bar close
  ongoingCount: number;
  highThresholdPct: number;
  tiers: Array<{
    label: string;
    count: number;
    sharePct: number;
    avgGainPct: number;
    avgDurationBars: number;
  }>;
  topMagnitudeDrivers: MagnitudeFeatureDriver[];
}

export interface ConditionGap {
  label: string;
  satisfied: boolean;
  current: string;
  gapText: string;
  closeness: number; // 0..1, 1 = satisfied
}

export interface NearTriggerRule {
  ruleId: string;
  title: string;
  category: HindsightHypothesis["category"];
  winRate: number;
  winRateLowerBound: number;
  medianGainPct: number;
  triggerCount: number;
  satisfiedCount: number;
  totalConditions: number;
  closeness: number;
  conditions: ConditionGap[];
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
