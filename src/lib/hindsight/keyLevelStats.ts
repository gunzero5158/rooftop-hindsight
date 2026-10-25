import { Candle } from "../shared-types/interop";
import { SupportResistanceStat, TimelineFeatures } from "./types";

/**
 * Calculates percentile from an array of numbers.
 */
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(2));
}

/**
 * Evaluates support and resistance touch statistics with approach direction filtering.
 */
export function calculateKeyLevelStats(
  candles: Candle[],
  timeline: TimelineFeatures[],
  levelKey: string,
  touchTolerancePct: number = 2.5,
  startIndex: number = 0
): SupportResistanceStat {
  const n = candles.length;
  let totalTouches = 0;
  let holds = 0;
  let falseBreakdowns = 0;
  let trueBreakdowns = 0;
  const pierceDepths: number[] = [];

  let lastTouchIndex = -10;

  for (let i = Math.max(5, startIndex); i < n - 2; i++) {
    // Cooldown between touch events
    if (i - lastTouchIndex < 4) continue;

    const levelPrice = timeline[i].mas[levelKey];
    if (!Number.isFinite(levelPrice) || levelPrice <= 0) continue;

    const prevCandle = candles[i - 1];
    const prevLevel = timeline[i - 1]?.mas[levelKey] || levelPrice;
    const prevTolerance = (touchTolerancePct / 100) * prevLevel;

    // Approach from above: Prior candle must be above the tolerance band, and prior 5 bars mostly above
    const wasAboveTolerance = prevCandle.close > prevLevel + prevTolerance || prevCandle.low > prevLevel + prevTolerance;
    let barsAbove = 0;
    for (let k = i - 5; k < i; k++) {
      const pLevel = timeline[k]?.mas[levelKey];
      if (Number.isFinite(pLevel) && candles[k].close > pLevel) {
        barsAbove++;
      }
    }

    // Current candle pulls back into tolerance band
    const c = candles[i];
    const tolerance = (touchTolerancePct / 100) * levelPrice;
    const entersZone = c.low <= levelPrice + tolerance;

    if (!wasAboveTolerance) continue;
    if (barsAbove < 3) continue;
    if (!entersZone) continue;

    totalTouches++;
    lastTouchIndex = i;

    const intradayPiercePct = c.low < levelPrice ? ((levelPrice - c.low) / levelPrice) * 100 : 0;

    // 1. Direct hold: closed at or above level
    if (c.close >= levelPrice) {
      holds++;
      pierceDepths.push(intradayPiercePct);
    } else {
      // 2. Closed below level: check next 1~2 bars
      const next1 = candles[i + 1];
      const next1Level = timeline[i + 1]?.mas[levelKey] || levelPrice;
      const next2 = candles[i + 2];
      const next2Level = timeline[i + 2]?.mas[levelKey] || levelPrice;

      if (next1 && next1.close >= next1Level) {
        // Reclaimed in 1 day! (TC-KL-01)
        falseBreakdowns++;
        pierceDepths.push(Math.max(intradayPiercePct, ((next1Level - next1.low) / next1Level) * 100));
      } else if (next2 && next2.close >= next2Level) {
        // Reclaimed in 2 days!
        falseBreakdowns++;
        pierceDepths.push(Math.max(intradayPiercePct, ((next2Level - next2.low) / next2Level) * 100));
      } else {
        // Consecutive 2 days below: true breakdown (TC-KL-01)
        trueBreakdowns++;
      }
    }
  }

  const holdRate = totalTouches > 0 ? Number((holds / totalTouches).toFixed(3)) : 0;
  const falseBreakdownRate = totalTouches > 0 ? Number((falseBreakdowns / totalTouches).toFixed(3)) : 0;
  const trueBreakdownRate = totalTouches > 0 ? Number((trueBreakdowns / totalTouches).toFixed(3)) : 0;
  const maxPierceDepthPct80 = calculatePercentile(pierceDepths, 80);
  const medianPierceDepthPct = calculatePercentile(pierceDepths, 50);

  return {
    levelKey,
    approachFrom: "above",
    totalTouches,
    holds,
    holdRate,
    falseBreakdowns,
    falseBreakdownRate,
    trueBreakdowns,
    trueBreakdownRate,
    maxPierceDepthPct80,
    medianPierceDepthPct,
  };
}

export interface KeyLevelTouchStat {
  maKey: string;
  totalTouches: number;
  totalHolds: number;
  holdRate: number;
  totalBreakdowns: number;
  totalFalseBreaks: number;
  falseBreakRate: number;
  maxPierceDepthPctMedian: number;
  maxPierceDepthPct80: number;
  recommendedConfirmDays: 1 | 2;
}

export function scanAllKeyLevels(
  candles: Candle[],
  timeline: TimelineFeatures[],
  startIndex: number = 0
): KeyLevelTouchStat[] {
  const keys = ["EMA5", "EMA10", "EMA20", "EMA30", "EMA60", "MA5", "MA10", "MA20", "MA30", "MA60"];
  const res: KeyLevelTouchStat[] = [];

  for (const k of keys) {
    const s = calculateKeyLevelStats(candles, timeline, k, 2.5, startIndex);
    if (s.totalTouches > 0) {
      res.push({
        maKey: k,
        totalTouches: s.totalTouches,
        totalHolds: s.holds,
        holdRate: s.holdRate,
        totalBreakdowns: s.trueBreakdowns,
        totalFalseBreaks: s.falseBreakdowns,
        falseBreakRate: s.falseBreakdownRate,
        maxPierceDepthPctMedian: s.medianPierceDepthPct,
        maxPierceDepthPct80: s.maxPierceDepthPct80,
        recommendedConfirmDays: s.falseBreakdownRate > 0.4 ? 2 : 1,
      });
    }
  }

  return res;
}

