import { Candle } from "../shared-types/interop";
import { ConditionAtom, SwingSegment, TimelineFeatures } from "./types";
import { extractSwingSegments } from "./swingExtractor";

export interface AtomPreScanResult {
  atom: ConditionAtom;
  label: string;
  successRateInSwings: number; // e.g. 8/10 = 0.8
  hitCountInSwings: number;
  totalSwings: number;
  hitCountInFails: number;
  totalFails: number;
  separationRatio: number; // successRateInSwings - failRateInFails
}

/**
 * Checks if a single ConditionAtom is satisfied at bar index i on the timeline.
 */
export function checkAtomCondition(
  feature: TimelineFeatures,
  atom: ConditionAtom
): boolean {
  switch (atom.type) {
    case "price_near_ma": {
      const maKey = String(atom.params.maKey || "EMA60");
      const minPct = Number(atom.params.minPct ?? -2.5);
      const maxPct = Number(atom.params.maxPct ?? 2.5);
      const dist = feature.maDistancesPct[maKey];
      if (typeof dist !== "number" || isNaN(dist)) return false;
      return dist >= minPct && dist <= maxPct;
    }

    case "kdj_zone_or_cross": {
      const mode = String(atom.params.mode || "j_below");
      const threshold = Number(atom.params.threshold ?? 10);
      if (mode === "j_below") return feature.kdj.j <= threshold;
      if (mode === "j_above") return feature.kdj.j >= threshold;
      if (mode === "golden_cross") return feature.kdjCross === "golden";
      if (mode === "death_cross") return feature.kdjCross === "death";
      return false;
    }

    case "rsi_zone": {
      const mode = String(atom.params.mode || "below");
      const threshold = Number(atom.params.threshold ?? 35);
      if (mode === "below") return feature.rsi <= threshold;
      if (mode === "above") return feature.rsi >= threshold;
      return false;
    }

    case "macd_state": {
      const mode = String(atom.params.mode || "golden_cross");
      if (mode === "golden_cross") return feature.macdCross === "golden";
      if (mode === "bottom_divergence") return feature.macdDivergence === "bottom";
      if (mode === "top_divergence") return feature.macdDivergence === "top";
      if (mode === "hist_positive") return feature.macd.hist > 0;
      return false;
    }

    case "candlestick_pattern": {
      const pattern = String(atom.params.pattern || "hammer");
      // @ts-expect-error pattern can be any string
      return feature.candlestickPatterns.has(pattern);
    }

    case "fib_retracement_near": {
      const targetRatio = Number(atom.params.ratio ?? 0.618);
      const tolerancePct = Number(atom.params.tolerancePct ?? 2.0);
      return feature.fibLevels.some(
        f => Math.abs(f.ratio - targetRatio) < 0.05 && Math.abs(f.distancePct) <= tolerancePct
      );
    }

    case "vpvr_zone_near": {
      if (!feature.vpvr) return false;
      const target = String(atom.params.target || "poc");
      const tolerancePct = Number(atom.params.tolerancePct ?? 2.0);
      if (target === "poc") return Math.abs(feature.vpvr.distPocPct) <= tolerancePct;
      return false;
    }

    case "volume_ratio": {
      const mode = String(atom.params.mode || "below");
      const threshold = Number(atom.params.threshold ?? 0.8);
      if (mode === "below") return feature.volumeRatio20 <= threshold;
      if (mode === "above") return feature.volumeRatio20 >= threshold;
      return false;
    }

    case "ma_consecutive_break": {
      const maKey = String(atom.params.maKey || "EMA5");
      const days = Number(atom.params.days ?? 2);
      return (feature.consecutiveBarsBelow[maKey] || 0) >= days;
    }

    case "ma_slope_direction": {
      const maKey = String(atom.params.maKey || "EMA60");
      const direction = String(atom.params.direction || "up");
      return feature.maSlopes[maKey] === direction;
    }

    default:
      return false;
  }
}

/**
 * Pre-scans atomic candidate features across extracted upward swing starting points.
 */
export function preScanCandidateAtoms(
  timeline: TimelineFeatures[],
  successfulSwings: SwingSegment[],
  failedRebounds: SwingSegment[]
): AtomPreScanResult[] {
  const candidatePool: Array<{ atom: ConditionAtom; label: string }> = [
    // Moving averages proximity
    { atom: { type: "price_near_ma", params: { maKey: "EMA20", minPct: -2.5, maxPct: 2.5 } }, label: "价格在 EMA20 ±2.5% 内" },
    { atom: { type: "price_near_ma", params: { maKey: "EMA30", minPct: -2.5, maxPct: 2.5 } }, label: "价格在 EMA30 ±2.5% 内" },
    { atom: { type: "price_near_ma", params: { maKey: "EMA60", minPct: -2.5, maxPct: 2.5 } }, label: "价格在 EMA60 ±2.5% 内" },
    { atom: { type: "price_near_ma", params: { maKey: "EMA120", minPct: -3.0, maxPct: 3.0 } }, label: "价格在 EMA120 ±3.0% 内" },
    { atom: { type: "price_near_ma", params: { maKey: "MA60", minPct: -2.5, maxPct: 2.5 } }, label: "价格在 MA60 ±2.5% 内" },
    // Oscillators
    { atom: { type: "kdj_zone_or_cross", params: { mode: "j_below", threshold: 10 } }, label: "KDJ 的 J < 10 (超卖)" },
    { atom: { type: "kdj_zone_or_cross", params: { mode: "j_below", threshold: 0 } }, label: "KDJ 的 J < 0 (深度超卖)" },
    { atom: { type: "kdj_zone_or_cross", params: { mode: "golden_cross" } }, label: "KDJ 金叉" },
    { atom: { type: "rsi_zone", params: { mode: "below", threshold: 35 } }, label: "RSI(14) < 35 (超卖)" },
    { atom: { type: "macd_state", params: { mode: "golden_cross" } }, label: "MACD 金叉" },
    { atom: { type: "macd_state", params: { mode: "bottom_divergence" } }, label: "MACD 底背离" },
    // Candlestick Patterns
    { atom: { type: "candlestick_pattern", params: { pattern: "hammer" } }, label: "锤头线" },
    { atom: { type: "candlestick_pattern", params: { pattern: "long_lower_shadow" } }, label: "长下影线 (下影>60%)" },
    { atom: { type: "candlestick_pattern", params: { pattern: "bullish_engulfing" } }, label: "看涨吞没" },
    { atom: { type: "candlestick_pattern", params: { pattern: "morning_star" } }, label: "早晨之星" },
    // Fib & VPVR
    { atom: { type: "fib_retracement_near", params: { ratio: 0.618, tolerancePct: 2.0 } }, label: "斐波那契 0.618 附近" },
    { atom: { type: "fib_retracement_near", params: { ratio: 0.5, tolerancePct: 2.0 } }, label: "斐波那契 0.500 附近" },
    { atom: { type: "vpvr_zone_near", params: { target: "poc", tolerancePct: 2.0 } }, label: "筹码密集峰 POC 附近" },
    // Volume
    { atom: { type: "volume_ratio", params: { mode: "below", threshold: 0.75 } }, label: "缩量回踩 (量比 < 0.75)" },
  ];

  const results: AtomPreScanResult[] = [];
  const totalSwings = successfulSwings.length;
  const totalFails = failedRebounds.length;

  for (const item of candidatePool) {
    let hitSwings = 0;
    for (const s of successfulSwings) {
      if (checkAtomCondition(timeline[s.startIndex], item.atom)) {
        hitSwings++;
      }
    }

    let hitFails = 0;
    for (const f of failedRebounds) {
      if (checkAtomCondition(timeline[f.startIndex], item.atom)) {
        hitFails++;
      }
    }

    const successRate = totalSwings > 0 ? hitSwings / totalSwings : 0;
    const failRate = totalFails > 0 ? hitFails / totalFails : 0;

    results.push({
      atom: item.atom,
      label: item.label,
      successRateInSwings: Number(successRate.toFixed(3)),
      hitCountInSwings: hitSwings,
      totalSwings,
      hitCountInFails: hitFails,
      totalFails,
      separationRatio: Number((successRate - failRate).toFixed(3)),
    });
  }

  // Sort by high separation and hit count
  return results.sort((a, b) => b.separationRatio - a.separationRatio || b.hitCountInSwings - a.hitCountInSwings);
}

/**
 * Pre-scans candidate atoms against historical swings extracted from candles.
 */
export function preScanAllAtoms(
  candles: Candle[],
  timeline: TimelineFeatures[],
  swings: SwingSegment[]
): AtomPreScanResult[] {
  const { failedRebounds } = extractSwingSegments(candles);
  return preScanCandidateAtoms(timeline, swings, failedRebounds);
}

