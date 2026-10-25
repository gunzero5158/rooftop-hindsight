import { Candle } from "../shared-types/interop";
import { checkAtomCondition } from "./univariatePreScan";
import { EvaluationResult, HindsightHypothesis, TimelineFeatures } from "./types";

export interface EvaluatorOptions {
  minSwingPct?: number; // default 0.10
  horizonBars?: number; // default 40
  cooldownBars?: number; // default 5
  minTriggers?: number; // default 8
}

/**
 * Calculates baseline win rate across all eligible bars in the period.
 */
export function calculateBaselineWinRate(
  candles: Candle[],
  minSwingPct: number,
  horizonBars: number,
  isBullish: boolean = true
): number {
  const n = candles.length;
  if (n <= horizonBars) return 0.5;

  let wins = 0;
  let total = 0;

  for (let i = 0; i < n - 5; i++) {
    const startPrice = candles[i].close;
    const maxLookahead = Math.min(n - 1, i + horizonBars);
    let win = false;

    if (isBullish) {
      for (let j = i + 1; j <= maxLookahead; j++) {
        if (candles[j].high >= startPrice * (1 + minSwingPct)) {
          win = true;
          break;
        }
      }
    } else {
      for (let j = i + 1; j <= maxLookahead; j++) {
        if (candles[j].low <= startPrice * (1 - minSwingPct)) {
          win = true;
          break;
        }
      }
    }

    if (win) wins++;
    total++;
  }

  return total > 0 ? Number((wins / total).toFixed(3)) : 0.5;
}

/**
 * Scans a ConditionDSL hypothesis across the full history and calculates exact win rate and OOS stats.
 */
export function evaluateHypothesis(
  candles: Candle[],
  timeline: TimelineFeatures[],
  hypothesis: HindsightHypothesis,
  options: EvaluatorOptions = {}
): EvaluationResult {
  const minSwingPct = options.minSwingPct ?? 0.10;
  const horizonBars = options.horizonBars ?? 40;
  const cooldownBars = options.cooldownBars ?? 5;
  const n = candles.length;

  const isBullish = hypothesis.category === "bullish_entry" || hypothesis.category === "support_hold";
  const baselineWinRate = calculateBaselineWinRate(candles, minSwingPct, horizonBars, isBullish);

  // 1. Scan timeline for raw matches
  const rawHitIndices: number[] = [];
  for (let i = 0; i < n - 2; i++) {
    const feat = timeline[i];
    const match = hypothesis.conditions.every(atom => checkAtomCondition(feat, atom));
    if (match) {
      rawHitIndices.push(i);
    }
  }

  // 2. Apply cluster cooldown deduplication (TC-EV-02)
  // Consecutive or clustered triggers within cooldownBars belong to the same wave cluster
  const triggeredIndices: number[] = [];
  let lastInCluster = -1;

  for (const idx of rawHitIndices) {
    if (lastInCluster === -1 || idx - lastInCluster > cooldownBars) {
      triggeredIndices.push(idx);
      lastInCluster = idx;
    } else {
      // Extend the current ongoing signal cluster
      lastInCluster = idx;
    }
  }

  // 3. Evaluate each trigger's forward outcome
  const winningIndices: number[] = [];
  const gains: number[] = [];

  for (const i of triggeredIndices) {
    const startPrice = candles[i].close;
    const maxLookahead = Math.min(n - 1, i + horizonBars);
    let isWin = false;
    let maxGain = 0;

    if (isBullish) {
      let highest = startPrice;
      for (let j = i + 1; j <= maxLookahead; j++) {
        if (candles[j].high > highest) highest = candles[j].high;
      }
      maxGain = ((highest - startPrice) / startPrice) * 100;
      if (highest >= startPrice * (1 + minSwingPct)) {
        isWin = true;
      }
    } else {
      let lowest = startPrice;
      for (let j = i + 1; j <= maxLookahead; j++) {
        if (candles[j].low < lowest) lowest = candles[j].low;
      }
      maxGain = ((startPrice - lowest) / startPrice) * 100;
      if (lowest <= startPrice * (1 - minSwingPct)) {
        isWin = true;
      }
    }

    gains.push(maxGain);
    if (isWin) {
      winningIndices.push(i);
    }
  }

  const triggerCount = triggeredIndices.length;
  const winCount = winningIndices.length;
  const winRate = triggerCount > 0 ? Number((winCount / triggerCount).toFixed(3)) : 0;
  const excessWinRate = Number((winRate - baselineWinRate).toFixed(3));
  const avgGain = gains.length > 0 ? Number((gains.reduce((a, b) => a + b, 0) / gains.length).toFixed(2)) : 0;

  // 4. 70/30 In-Sample / Out-of-Sample split (TC-EV-03)
  const splitIndex = Math.floor(n * 0.7);
  let oosTriggerCount = 0;
  let oosWinCount = 0;

  for (const idx of triggeredIndices) {
    if (idx >= splitIndex) {
      oosTriggerCount++;
      if (winningIndices.includes(idx)) {
        oosWinCount++;
      }
    }
  }

  const oosWinRate = oosTriggerCount > 0 ? Number((oosWinCount / oosTriggerCount).toFixed(3)) : 0;
  let oosStatus: "oos_validated" | "oos_untested" | "oos_degraded";

  if (oosTriggerCount < 2) {
    oosStatus = "oos_untested";
  } else if (oosWinRate >= baselineWinRate) {
    oosStatus = "oos_validated";
  } else {
    oosStatus = "oos_degraded";
  }

  // 5. Sample gate
  const minRequired = options.minTriggers ?? (n < 200 ? 5 : 8);
  let status: "high_confidence" | "insufficient_sample" | "degraded";

  if (triggerCount < minRequired) {
    status = "insufficient_sample";
  } else if (oosStatus === "oos_degraded") {
    status = "degraded";
  } else {
    status = "high_confidence";
  }

  return {
    hypothesis,
    triggerCount,
    winCount,
    winRate,
    baselineWinRate,
    excessWinRate,
    oosStatus,
    oosTriggerCount,
    oosWinCount,
    oosWinRate,
    status,
    triggeredIndices,
    winningIndices,
    averageGainPct: avgGain,
  };
}
