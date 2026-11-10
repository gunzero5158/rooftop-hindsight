import { Candle } from "../shared-types/interop";
import { CANDIDATE_ATOM_POOL, checkAtomCondition } from "./univariatePreScan";
import { evaluateHypothesis } from "./hypothesisEvaluator";
import { ConditionAtom, MagnitudeFeatureDriver, MagnitudeProfile, SwingSegment, TimelineFeatures } from "./types";

const PATTERN_CN_MAP: Record<string, string> = {
  hammer: "锤头线",
  long_lower_shadow: "长下影线",
  bullish_engulfing: "看涨吞没",
  morning_star: "早晨之星",
  piercing_line: "刺透形态",
  doji: "十字星",
};

const LOW_SAMPLE_THRESHOLD = 15;
const MIN_DRIVER_OCCURRENCES = 5;

function avg(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const round2 = (v: number) => Number(v.toFixed(2));

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

    const matchedTags = CANDIDATE_ATOM_POOL
      .filter(item => isAtomPresentNearTrough(timeline, s.startIndex, item.atom))
      .map(item => item.label);

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
 * Average forward max gain (%) from the close of every judgeable bar: the "no signal" reference.
 */
export function calculateBaselineForwardGain(
  candles: Candle[],
  horizonBars: number,
  startIndex: number = 0
): number {
  const gains: number[] = [];
  for (let i = startIndex; i < candles.length - horizonBars; i++) {
    let highest = candles[i].close;
    for (let j = i + 1; j <= i + horizonBars; j++) {
      if (candles[j].high > highest) highest = candles[j].high;
    }
    gains.push(((highest - candles[i].close) / candles[i].close) * 100);
  }
  return round2(avg(gains));
}

/**
 * Builds the rebound magnitude / multiplier profile.
 *
 * - Swing statistics are reported in two calibers: trough low (ideal) and trough-day close (tradable proxy).
 * - Feature drivers are measured over ALL occurrences of each feature (wins and failures alike) from the
 *   signal-day close, which avoids the survivorship bias of only looking at successful swings.
 *   The share of successful troughs carrying the feature is kept as a descriptive portrait.
 */
export function buildMagnitudeProfile(
  candles: Candle[],
  swings: SwingSegment[],
  timeline: TimelineFeatures[],
  options: { minSwingPct?: number; horizonBars?: number; startIndex?: number } = {}
): MagnitudeProfile {
  const minSwingPct = options.minSwingPct ?? 0.10;
  const horizonBars = options.horizonBars ?? 40;
  const startIndex = options.startIndex ?? 0;

  const basePct = minSwingPct * 100;
  const midCut = Number((basePct * 1.6).toFixed(1));
  const highCut = Number((basePct * 2.5).toFixed(1));
  const n = swings.length;
  const baselineForwardGainPct = calculateBaselineForwardGain(candles, horizonBars, startIndex);

  const gains = swings.map(s => s.gainPct);
  const closeGains = swings.map(s => s.closeGainPct ?? s.gainPct);
  const avgGainPct = round2(avg(gains));
  const maxGainPct = n > 0 ? round2(Math.max(...gains)) : 0;

  const tierDefs = [
    { label: `常规反弹 (${basePct.toFixed(0)}% ~ ${midCut}%)`, filter: (g: number) => g < midCut },
    { label: `中级主升 (${midCut}% ~ ${highCut}%)`, filter: (g: number) => g >= midCut && g < highCut },
    { label: `高倍大主升 (≥ ${highCut}%)`, filter: (g: number) => g >= highCut },
  ];
  const tiers = n === 0 ? [] : tierDefs.map(td => {
    const matched = swings.filter(s => td.filter(s.gainPct));
    return {
      label: td.label,
      count: matched.length,
      sharePct: Number(((matched.length / n) * 100).toFixed(1)),
      avgGainPct: Number(avg(matched.map(s => s.gainPct)).toFixed(1)),
      avgDurationBars: Math.round(avg(matched.map(s => s.durationBars))),
    };
  });

  // Feature drivers over all occurrences (single-atom backtest from signal-day close)
  const drivers: MagnitudeFeatureDriver[] = [];
  CANDIDATE_ATOM_POOL.forEach((item, idx) => {
    const res = evaluateHypothesis(
      candles,
      timeline,
      { id: `magnitude_${idx}`, category: "bullish_entry", title: item.label, conditions: [item.atom], aiRationale: "" },
      { minSwingPct, horizonBars, startIndex }
    );
    if (res.triggerCount === 0) return;

    const hitSwings = swings.filter(s => isAtomPresentNearTrough(timeline, s.startIndex, item.atom));
    drivers.push({
      label: item.label,
      atom: item.atom,
      occurrenceCount: res.triggerCount,
      winRate: res.winRate,
      avgForwardGainPct: res.averageGainPct,
      medianForwardGainPct: res.medianGainPct,
      liftVsBaselinePct: round2(res.averageGainPct - baselineForwardGainPct),
      swingHitCount: hitSwings.length,
      swingHitRate: n > 0 ? Number((hitSwings.length / n).toFixed(3)) : 0,
      avgSwingGainWhenPresent: round2(avg(hitSwings.map(s => s.gainPct))),
    });
  });

  // Rank: enough occurrences first, then median forward gain (robust to outliers), then lift
  drivers.sort((a, b) => {
    const aValid = a.occurrenceCount >= MIN_DRIVER_OCCURRENCES ? 1 : 0;
    const bValid = b.occurrenceCount >= MIN_DRIVER_OCCURRENCES ? 1 : 0;
    return bValid - aValid || b.medianForwardGainPct - a.medianForwardGainPct || b.liftVsBaselinePct - a.liftVsBaselinePct;
  });

  return {
    sampleCount: n,
    lowSampleWarning: n < LOW_SAMPLE_THRESHOLD,
    avgGainPct,
    medianGainPct: round2(percentile(gains, 50)),
    p80GainPct: round2(percentile(gains, 80)),
    maxGainPct,
    avgMultiplier: Number((1 + avgGainPct / 100).toFixed(2)),
    maxMultiplier: Number((1 + maxGainPct / 100).toFixed(2)),
    avgCloseGainPct: round2(avg(closeGains)),
    medianCloseGainPct: round2(percentile(closeGains, 50)),
    p80CloseGainPct: round2(percentile(closeGains, 80)),
    baselineForwardGainPct,
    ongoingCount: swings.filter(s => s.ongoing).length,
    highThresholdPct: midCut,
    tiers,
    topMagnitudeDrivers: drivers.slice(0, 8),
  };
}
