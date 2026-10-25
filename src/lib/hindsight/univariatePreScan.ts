import { Candle } from "../shared-types/interop";
import { ConditionAtom, MagnitudeFeatureDriver, MagnitudeProfile, SwingSegment, TimelineFeatures } from "./types";
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

export const CANDIDATE_ATOM_POOL: Array<{ atom: ConditionAtom; label: string }> = [
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

/**
 * Pre-scans atomic candidate features across extracted upward swing starting points.
 */
export function preScanCandidateAtoms(
  timeline: TimelineFeatures[],
  successfulSwings: SwingSegment[],
  failedRebounds: SwingSegment[]
): AtomPreScanResult[] {
  const candidatePool = CANDIDATE_ATOM_POOL;

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
 * Pre-scans candidate atoms against the given swings and the failed rebounds
 * extracted with the same threshold, restricted to the analysis window.
 */
export function preScanAllAtoms(
  candles: Candle[],
  timeline: TimelineFeatures[],
  swings: SwingSegment[],
  minSwingPct: number = 0.10,
  horizonBars: number = 40,
  startIndex: number = 0
): AtomPreScanResult[] {
  const { failedRebounds } = extractSwingSegments(candles, minSwingPct, horizonBars);
  return preScanCandidateAtoms(
    timeline,
    swings,
    failedRebounds.filter(f => f.startIndex >= startIndex)
  );
}

const PATTERN_CN_MAP: Record<string, string> = {
  hammer: "锤头线",
  long_lower_shadow: "长下影线",
  bullish_engulfing: "看涨吞没",
  morning_star: "早晨之星",
  piercing_line: "刺透形态",
  doji: "十字星",
};

/**
 * Checks whether an atom holds at the trough bar or its ±1 neighbor bar (bottom formation zone).
 */
function isAtomPresentNearTrough(
  timeline: TimelineFeatures[],
  troughIdx: number,
  atom: ConditionAtom
): boolean {
  const start = Math.max(0, troughIdx - 1);
  const end = Math.min(timeline.length - 1, troughIdx + 1);
  for (let i = start; i <= end; i++) {
    if (checkAtomCondition(timeline[i], atom)) return true;
  }
  return false;
}

/**
 * Attaches multiplier and indicator snapshot at the trough bar to each swing segment.
 */
export function enrichSwingsWithFeatures(
  swings: SwingSegment[],
  timeline: TimelineFeatures[]
): SwingSegment[] {
  const maKeys = ["EMA20", "EMA30", "EMA60", "EMA120", "MA20", "MA60"];
  return swings.map(s => {
    const feat = timeline[s.startIndex];
    const multiplier = Number((s.peakPrice / s.startPrice).toFixed(2));
    if (!feat) return { ...s, multiplier };

    // Find closest moving average
    let nearestMa: string | undefined;
    let minAbsDist = Infinity;
    for (const k of maKeys) {
      const d = feat.maDistancesPct[k];
      if (typeof d === "number" && Number.isFinite(d) && Math.abs(d) < minAbsDist) {
        minAbsDist = Math.abs(d);
        nearestMa = `${k} (${d >= 0 ? "+" : ""}${d.toFixed(1)}%)`;
      }
    }

    const patterns: string[] = [];
    feat.candlestickPatterns.forEach(p => {
      if (PATTERN_CN_MAP[p]) patterns.push(PATTERN_CN_MAP[p]);
    });

    let macdState: string | undefined;
    if (feat.macdDivergence === "bottom") macdState = "MACD底背离";
    else if (feat.macdCross === "golden") macdState = "MACD金叉";

    const matchedTags: string[] = [];
    for (const item of CANDIDATE_ATOM_POOL) {
      if (isAtomPresentNearTrough(timeline, s.startIndex, item.atom)) {
        matchedTags.push(item.label);
      }
    }

    return {
      ...s,
      multiplier,
      entryFeatures: {
        nearestMa: minAbsDist <= 4.0 ? nearestMa : undefined,
        kdjJ: Number.isFinite(feat.kdj.j) ? Number(feat.kdj.j.toFixed(1)) : 50,
        rsi: Number.isFinite(feat.rsi) ? Number(feat.rsi.toFixed(1)) : 50,
        volumeRatio20: Number.isFinite(feat.volumeRatio20) ? Number(feat.volumeRatio20.toFixed(2)) : 1,
        macdState,
        patterns,
        matchedTags: matchedTags.slice(0, 5),
      },
    };
  });
}

/**
 * Builds the global rebound magnitude / multiplier profile and identifies which
 * trough-level technical features correspond to larger rebounds.
 */
export function buildMagnitudeProfile(
  swings: SwingSegment[],
  timeline: TimelineFeatures[],
  minSwingPct: number = 0.10
): MagnitudeProfile {
  const basePct = minSwingPct * 100;
  const midCut = Number((basePct * 1.6).toFixed(1));
  const highCut = Number((basePct * 2.5).toFixed(1));

  if (swings.length === 0) {
    return {
      avgGainPct: 0,
      medianGainPct: 0,
      p80GainPct: 0,
      maxGainPct: 0,
      avgMultiplier: 1,
      maxMultiplier: 1,
      highThresholdPct: highCut,
      tiers: [],
      topMagnitudeDrivers: [],
    };
  }

  const sortedGains = swings.map(s => s.gainPct).sort((a, b) => a - b);
  const n = sortedGains.length;
  const avgGainPct = Number((sortedGains.reduce((a, b) => a + b, 0) / n).toFixed(2));
  const medianGainPct = Number(sortedGains[Math.floor(n / 2)].toFixed(2));
  const p80Idx = Math.min(n - 1, Math.max(0, Math.ceil(0.8 * n) - 1));
  const p80GainPct = Number(sortedGains[p80Idx].toFixed(2));
  const maxGainPct = Number(sortedGains[n - 1].toFixed(2));

  // 3-tier distribution
  const tierDefs = [
    { label: `常规反弹 (${basePct.toFixed(0)}% ~ ${midCut}%)`, filter: (g: number) => g < midCut },
    { label: `中级主升 (${midCut}% ~ ${highCut}%)`, filter: (g: number) => g >= midCut && g < highCut },
    { label: `高倍大主升 (≥ ${highCut}%)`, filter: (g: number) => g >= highCut },
  ];

  const tiers = tierDefs.map(td => {
    const matched = swings.filter(s => td.filter(s.gainPct));
    const count = matched.length;
    const avgG = count > 0 ? Number((matched.reduce((a, s) => a + s.gainPct, 0) / count).toFixed(1)) : 0;
    const avgDur = count > 0 ? Math.round(matched.reduce((a, s) => a + s.durationBars, 0) / count) : 0;
    return {
      label: td.label,
      count,
      sharePct: Number(((count / n) * 100).toFixed(1)),
      avgGainPct: avgG,
      avgDurationBars: avgDur,
    };
  });

  // High-magnitude swings: top 35% or >= midCut
  const highSwings = swings.filter(s => s.gainPct >= midCut);
  const highPool = highSwings.length > 0 ? highSwings : swings.slice().sort((a, b) => b.gainPct - a.gainPct).slice(0, Math.max(1, Math.ceil(n * 0.35)));

  const drivers: MagnitudeFeatureDriver[] = [];
  for (const item of CANDIDATE_ATOM_POOL) {
    const matchedSwings = swings.filter(s => isAtomPresentNearTrough(timeline, s.startIndex, item.atom));
    if (matchedSwings.length === 0) continue;

    const avgWhen = Number((matchedSwings.reduce((a, s) => a + s.gainPct, 0) / matchedSwings.length).toFixed(2));
    const maxWhen = Number(Math.max(...matchedSwings.map(s => s.gainPct)).toFixed(2));
    const highHits = highPool.filter(s => isAtomPresentNearTrough(timeline, s.startIndex, item.atom)).length;

    drivers.push({
      label: item.label,
      atom: item.atom,
      hitCount: matchedSwings.length,
      avgGainWhenPresent: avgWhen,
      maxGainWhenPresent: maxWhen,
      avgMultiplier: Number((1 + avgWhen / 100).toFixed(2)),
      liftVsBaselinePct: Number((avgWhen - avgGainPct).toFixed(2)),
      highMultipleHitRate: Number((highHits / highPool.length).toFixed(3)),
    });
  }

  // Sort by average rebound magnitude when present (requiring >= 2 hits when enough swings exist), then high-multiple hit rate
  const minHits = n >= 4 ? 2 : 1;
  drivers.sort((a, b) => {
    const aValid = a.hitCount >= minHits ? 1 : 0;
    const bValid = b.hitCount >= minHits ? 1 : 0;
    if (aValid !== bValid) return bValid - aValid;
    return b.avgGainWhenPresent - a.avgGainWhenPresent || b.highMultipleHitRate - a.highMultipleHitRate;
  });

  return {
    avgGainPct,
    medianGainPct,
    p80GainPct,
    maxGainPct,
    avgMultiplier: Number((1 + avgGainPct / 100).toFixed(2)),
    maxMultiplier: Number((1 + maxGainPct / 100).toFixed(2)),
    highThresholdPct: midCut,
    tiers,
    topMagnitudeDrivers: drivers.slice(0, 6),
  };
}

