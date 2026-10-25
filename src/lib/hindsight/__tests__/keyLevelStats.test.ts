import { describe, it, expect } from "vitest";
import { Candle } from "@/lib/shared-types/interop";
import { buildFeatureTimeline } from "../featureTimeline";
import { calculateKeyLevelStats } from "../keyLevelStats";

function createCandles(count: number, price: number = 100): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    candles.push({
      date: `2024-01-01`,
      open: price,
      high: price + 0.2,
      low: price - 0.2,
      close: price,
      volume: 1000,
    });
  }
  return candles;
}

describe("keyLevelStats", () => {
  it("TC-KL-01: Single day false breakdown vs 2-day true breakdown", () => {
    // 300 bars base at 100
    const candles = createCandles(300, 100);

    // 8 false breakdowns at: 30, 45, 60, 75, 90, 105, 120, 135
    for (let k = 0; k < 8; k++) {
      const idx = 30 + k * 15;
      // 3 bars rising so price is above EMA5 + tolerance
      candles[idx - 3] = { ...candles[idx - 3], open: 101, high: 103, low: 101, close: 103 };
      candles[idx - 2] = { ...candles[idx - 2], open: 103, high: 106, low: 103, close: 106 };
      candles[idx - 1] = { ...candles[idx - 1], open: 106, high: 109, low: 106, close: 109 }; // EMA5 ~ 105, price 109 > 105 * 1.025
      // Day idx: breaks below EMA5
      candles[idx] = { ...candles[idx], open: 105, high: 105, low: 100, close: 101.0 };
      // Day idx + 1: reclaims above EMA5
      candles[idx + 1] = { ...candles[idx + 1], open: 101, high: 108, low: 101, close: 107.5 };
    }

    // 4 true breakdowns at: 170, 195, 220, 245
    for (let k = 0; k < 4; k++) {
      const idx = 170 + k * 25;
      candles[idx - 3] = { ...candles[idx - 3], open: 101, high: 103, low: 101, close: 103 };
      candles[idx - 2] = { ...candles[idx - 2], open: 103, high: 106, low: 103, close: 106 };
      candles[idx - 1] = { ...candles[idx - 1], open: 106, high: 109, low: 106, close: 109 };
      // Day idx: breaks below EMA5
      candles[idx] = { ...candles[idx], open: 105, high: 105, low: 100, close: 101.0 };
      // Day idx + 1: stays below EMA5
      candles[idx + 1] = { ...candles[idx + 1], open: 100, high: 100.5, low: 98, close: 99.0 };
      // Day idx + 2: stays below EMA5
      candles[idx + 2] = { ...candles[idx + 2], open: 98, high: 98.5, low: 96, close: 97.0 };
    }

    const timeline = buildFeatureTimeline(candles);
    const stats = calculateKeyLevelStats(candles, timeline, "EMA5", 2.0);

    expect(stats.totalTouches).toBe(12);
    expect(stats.falseBreakdowns).toBe(8);
    expect(stats.trueBreakdowns).toBe(4);
    expect(stats.falseBreakdownRate).toBeCloseTo(8 / 12, 2);
    expect(stats.trueBreakdownRate).toBeCloseTo(4 / 12, 2);
  });

  it("TC-KL-02: Pierce depth percentiles for hold cases (median = 1.2%, 80th = 2.1%)", () => {
    // 250 bars base at 100 (so EMA60 stays around 100.0)
    const candles = createCandles(250, 100);

    // 9 touches holding EMA60 with depths: [0.2, 0.5, 0.8, 1.0, 1.2, 1.5, 1.8, 2.1, 3.0]
    const depths = [0.2, 0.5, 0.8, 1.0, 1.2, 1.5, 1.8, 2.1, 3.0];
    const touchIndices = [75, 90, 105, 120, 135, 150, 165, 180, 195];

    // Build timeline first to get exact EMA60 at each bar
    const initialTimeline = buildFeatureTimeline(candles);

    for (let k = 0; k < 9; k++) {
      const idx = touchIndices[k];
      const curEma60 = initialTimeline[idx].mas["EMA60"] || 100.0;

      // 3 bars rising up to curEma60 + 6 so prior bar is clearly above tolerance band
      candles[idx - 3] = { ...candles[idx - 3], open: curEma60 + 2, high: curEma60 + 3, low: curEma60 + 2, close: curEma60 + 3 };
      candles[idx - 2] = { ...candles[idx - 2], open: curEma60 + 3, high: curEma60 + 5, low: curEma60 + 3, close: curEma60 + 5 };
      candles[idx - 1] = { ...candles[idx - 1], open: curEma60 + 5, high: curEma60 + 7, low: curEma60 + 5, close: curEma60 + 7 };

      // Day idx: dips to curEma60 * (1 - depth/100) and closes above curEma60 (= holds!)
      const pierceLow = Number((curEma60 * (1 - depths[k] / 100)).toFixed(4));
      candles[idx] = {
        date: `2024-01-01`,
        open: curEma60 + 4,
        high: curEma60 + 4,
        low: pierceLow,
        close: curEma60 + 2.0,
        volume: 1500,
      };
      // Next bar stays up
      candles[idx + 1] = { ...candles[idx + 1], close: curEma60 + 2.0, low: curEma60 + 1.5 };
    }

    const timeline = buildFeatureTimeline(candles);
    // Recalibrate pierce lows to the final timeline's EMA60
    for (let k = 0; k < 9; k++) {
      const idx = touchIndices[k];
      const finalEma = timeline[idx].mas["EMA60"];
      candles[idx].low = Number((finalEma * (1 - depths[k] / 100)).toFixed(4));
    }
    const finalTimeline = buildFeatureTimeline(candles);
    const stats = calculateKeyLevelStats(candles, finalTimeline, "EMA60", 2.5);

    expect(stats.holds).toBe(9);
    expect(stats.totalTouches).toBe(9);
    expect(stats.medianPierceDepthPct).toBeCloseTo(1.2, 1);
    expect(stats.maxPierceDepthPct80).toBeCloseTo(2.1, 1);
  });

  it("TC-KL-03: Approach direction filtering (only counts touches from above)", () => {
    const candles = createCandles(250, 100);

    // 5 touches from above at: 75, 90, 105, 120, 135
    for (let k = 0; k < 5; k++) {
      const idx = 75 + k * 15;
      candles[idx - 3] = { ...candles[idx - 3], open: 101, high: 103, low: 101, close: 103 };
      candles[idx - 2] = { ...candles[idx - 2], open: 103, high: 105, low: 103, close: 105 };
      candles[idx - 1] = { ...candles[idx - 1], open: 105, high: 107, low: 105, close: 107 };
      candles[idx] = {
        date: `2024-01-01`,
        open: 104,
        high: 104,
        low: 99.5,
        close: 100.5,
        volume: 1500,
      };
    }

    // Now set bars 155 to 220 to trade down at 90 (well below 100)
    for (let i = 155; i < 220; i++) {
      candles[i] = {
        date: `2024-01-01`,
        open: 90,
        high: 90.5,
        low: 89.5,
        close: 90,
        volume: 1000,
      };
    }

    // 3 touches from below at: 170, 185, 200
    for (let k = 0; k < 3; k++) {
      const idx = 170 + k * 15;
      candles[idx] = {
        date: `2024-01-01`,
        open: 91,
        high: 100.5,
        low: 91,
        close: 99.0,
        volume: 1500,
      };
    }

    const timeline = buildFeatureTimeline(candles);
    const stats = calculateKeyLevelStats(candles, timeline, "EMA60", 2.5);

    expect(stats.totalTouches).toBe(5);
  });
});
