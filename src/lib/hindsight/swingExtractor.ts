import { Candle } from "../shared-types/interop";
import { SwingSegment } from "./types";

export interface SwingExtractionResult {
  successfulSwings: SwingSegment[];
  failedRebounds: SwingSegment[];
  bearishPeaks: SwingSegment[];
}

/**
 * Extracts true upward swing segments and failed bounces from historical candles.
 */
export function extractSwingSegments(
  candles: Candle[],
  minSwingPct: number = 0.10,
  horizonBars: number = 40
): SwingExtractionResult {
  const successfulSwings: SwingSegment[] = [];
  const failedRebounds: SwingSegment[] = [];
  const bearishPeaks: SwingSegment[] = [];

  const n = candles.length;
  if (n < 5) {
    return { successfulSwings, failedRebounds, bearishPeaks };
  }

  // 1. Identify local valleys (candidate bottoms)
  // A bar i is a candidate local low if its low <= low of neighbors
  const candidateLowIndices: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    const isValley =
      candles[i].low <= candles[i - 1].low && candles[i].low <= candles[i + 1].low;
    if (isValley) {
      candidateLowIndices.push(i);
    }
  }

  // Evaluate each candidate valley
  let lastCoveredIndex = -1;

  for (const i of candidateLowIndices) {
    // If this candidate valley is an intermediate dip within an ongoing primary uptrend
    // that started earlier and hasn't peaked yet, skip it to prevent sample bloating (TC-SW-03)
    if (i <= lastCoveredIndex) {
      continue;
    }

    const startLow = candles[i].low;
    const maxLookahead = Math.min(n - 1, i + horizonBars);

    let maxHigh = startLow;
    let maxHighIdx = i;
    let brokeBelowStart = false;
    let brokeIdx = -1;

    for (let j = i + 1; j <= maxLookahead; j++) {
      if (candles[j].high > maxHigh) {
        maxHigh = candles[j].high;
        maxHighIdx = j;
      }

      // Check if price breaks below startup low before hitting the target
      if (candles[j].low < startLow) {
        const currentGain = (maxHigh - startLow) / startLow;
        if (currentGain < minSwingPct) {
          brokeBelowStart = true;
          brokeIdx = j;
          break;
        }
      }
    }

    const finalGain = (maxHigh - startLow) / startLow;

    if (finalGain >= minSwingPct && !brokeBelowStart) {
      successfulSwings.push({
        startIndex: i,
        startDate: candles[i].date,
        startPrice: startLow,
        peakIndex: maxHighIdx,
        peakDate: candles[maxHighIdx].date,
        peakPrice: maxHigh,
        gainPct: Number((finalGain * 100).toFixed(2)),
        durationBars: maxHighIdx - i,
        isWin: true,
      });

      // Cover intermediate dips up to the peak (preventing 100 -> 104 -> 101 -> 113 duplicate triggers)
      lastCoveredIndex = maxHighIdx;
    } else {
      // Failed rebound
      failedRebounds.push({
        startIndex: i,
        startDate: candles[i].date,
        startPrice: startLow,
        peakIndex: maxHighIdx,
        peakDate: candles[maxHighIdx].date,
        peakPrice: maxHigh,
        gainPct: Number((finalGain * 100).toFixed(2)),
        durationBars: (brokeIdx > 0 ? brokeIdx : maxHighIdx) - i,
        isWin: false,
      });
    }
  }

  // 2. Identify candidate peaks (for bearish peak rules)
  let lastCoveredPeakIndex = -1;
  for (let i = 1; i < n - 1; i++) {
    const isPeak =
      candles[i].high >= candles[i - 1].high && candles[i].high >= candles[i + 1].high;
    if (!isPeak || i <= lastCoveredPeakIndex) continue;

    const startHigh = candles[i].high;
    const maxLookahead = Math.min(n - 1, i + horizonBars);

    let minLow = startHigh;
    let minLowIdx = i;
    let brokeAboveStart = false;

    for (let j = i + 1; j <= maxLookahead; j++) {
      if (candles[j].low < minLow) {
        minLow = candles[j].low;
        minLowIdx = j;
      }
      if (candles[j].high > startHigh) {
        const drop = (startHigh - minLow) / startHigh;
        if (drop < minSwingPct) {
          brokeAboveStart = true;
          break;
        }
      }
    }

    const finalDrop = (startHigh - minLow) / startHigh;
    if (finalDrop >= minSwingPct && !brokeAboveStart) {
      bearishPeaks.push({
        startIndex: i,
        startDate: candles[i].date,
        startPrice: startHigh,
        peakIndex: minLowIdx,
        peakDate: candles[minLowIdx].date,
        peakPrice: minLow,
        gainPct: Number((-finalDrop * 100).toFixed(2)),
        durationBars: minLowIdx - i,
        isWin: true,
      });
      lastCoveredPeakIndex = minLowIdx;
    }
  }

  return { successfulSwings, failedRebounds, bearishPeaks };
}

export interface SwingOptions {
  minSwingPct?: number;
  horizonBars?: number;
}

/**
 * Convenience helper returning just the successful upward swings.
 */
export function extractSwings(
  candles: Candle[],
  options?: SwingOptions | number,
  horizonBars?: number
): SwingSegment[] {
  let minPct = 0.10;
  let horizon = 40;
  if (typeof options === "number") {
    minPct = options;
    if (horizonBars !== undefined) horizon = horizonBars;
  } else if (options && typeof options === "object") {
    if (options.minSwingPct !== undefined) minPct = options.minSwingPct;
    if (options.horizonBars !== undefined) horizon = options.horizonBars;
  }
  return extractSwingSegments(candles, minPct, horizon).successfulSwings;
}


