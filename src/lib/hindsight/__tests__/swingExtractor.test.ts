import { describe, it, expect } from "vitest";
import { Candle } from "@/lib/shared-types/interop";
import { extractSwingSegments } from "../swingExtractor";
import { buildFeatureTimeline } from "../featureTimeline";
import { buildMagnitudeProfile, enrichSwingsWithFeatures } from "../univariatePreScan";

function createFlatCandles(count: number, basePrice: number = 100): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    candles.push({
      date: `2025-01-${String(i + 1).padStart(2, "0")}`,
      open: basePrice,
      high: basePrice + 1,
      low: basePrice - 1,
      close: basePrice,
      volume: 1000,
    });
  }
  return candles;
}

describe("swingExtractor", () => {
  it("TC-SW-01: Standard valid upward swing segment identification", () => {
    const candles = createFlatCandles(200, 105);

    // Prior bars slightly higher
    candles[28] = { ...candles[28], low: 102, close: 103 };
    candles[29] = { ...candles[29], low: 101, close: 102 };

    // Bar 30: bottom low = 100.0
    candles[30] = { ...candles[30], open: 101, high: 102, low: 100.0, close: 101 };

    // Subsequent bars rally up to 115.0 at bar 55 (+15%)
    for (let i = 31; i < 55; i++) {
      candles[i] = { ...candles[i], open: 101 + (i - 30) * 0.5, high: 102 + (i - 30) * 0.5, low: 100.5, close: 101.5 + (i - 30) * 0.5 };
    }
    // Bar 55: peak high = 115.0 (+15%)
    candles[55] = { ...candles[55], open: 113, high: 115.0, low: 112, close: 114 };

    const { successfulSwings } = extractSwingSegments(candles, 0.10, 40);

    expect(successfulSwings.length).toBeGreaterThanOrEqual(1);
    const target = successfulSwings.find(s => s.startIndex === 30);
    expect(target).toBeDefined();
    expect(target!.startPrice).toBe(100.0);
    expect(target!.peakPrice).toBe(115.0);
    expect(target!.gainPct).toBe(15.0);
    expect(target!.durationBars).toBe(25);
  });

  it("TC-SW-02: Bounces failing to reach threshold are filtered into failedRebounds", () => {
    const candles = createFlatCandles(100, 105);

    candles[19] = { ...candles[19], low: 102, close: 103 };
    // Bar 20: low 100.0
    candles[20] = { ...candles[20], open: 101, high: 102, low: 100.0, close: 101 };
    // Bounces to 106.0 (+6%) at bar 24
    candles[24] = { ...candles[24], open: 104, high: 106.0, low: 103, close: 105 };
    // Then breaks below 95.0 at bar 30
    candles[30] = { ...candles[30], open: 98, high: 98, low: 94.0, close: 94.5 };

    const { successfulSwings, failedRebounds } = extractSwingSegments(candles, 0.10, 40);

    const successfulAt20 = successfulSwings.find(s => s.startIndex === 20);
    expect(successfulAt20).toBeUndefined();

    const failedAt20 = failedRebounds.find(s => s.startIndex === 20);
    expect(failedAt20).toBeDefined();
    expect(failedAt20!.startPrice).toBe(100.0);
    expect(failedAt20!.isWin).toBe(false);
  });

  it("TC-SW-03: Multiple minor dips deduplication inside the same primary uptrend", () => {
    // 100 -> 104 -> 101 -> 113 (major uptrend where intermediate dip 101 didn't break 100)
    const candles = createFlatCandles(100, 105);

    candles[9] = { ...candles[9], low: 102, close: 103 };
    // Low 100 at bar 10
    candles[10] = { ...candles[10], open: 101, high: 102, low: 100.0, close: 101 };
    // High 104 at bar 15
    candles[15] = { ...candles[15], open: 103, high: 104.0, low: 102, close: 103.5 };
    // Dip 101 at bar 18 (valley)
    candles[17] = { ...candles[17], low: 102.5, close: 103 };
    candles[18] = { ...candles[18], open: 102, high: 103, low: 101.0, close: 102 };
    candles[19] = { ...candles[19], low: 102.5, close: 103 };
    // Final peak 113 at bar 30
    candles[30] = { ...candles[30], open: 111, high: 113.0, low: 110, close: 112 };

    const { successfulSwings } = extractSwingSegments(candles, 0.10, 40);

    // Only bar 10 is recorded as the start of this primary swing, not duplicating bar 18
    const swingAt10 = successfulSwings.find(s => s.startIndex === 10);
    expect(swingAt10).toBeDefined();
    expect(swingAt10!.startPrice).toBe(100.0);

    const swingAt18 = successfulSwings.find(s => s.startIndex === 18);
    expect(swingAt18).toBeUndefined();
  });

  it("TC-SW-04: Bearish peak recognition", () => {
    const candles = createFlatCandles(100, 140);

    candles[19] = { ...candles[19], high: 145 };
    // Peak at bar 20: 150.0
    candles[20] = { ...candles[20], open: 148, high: 150.0, low: 147, close: 149 };
    candles[21] = { ...candles[21], high: 146 };
    // Drops to 132.0 (-12%) at bar 45
    candles[45] = { ...candles[45], open: 134, high: 135, low: 132.0, close: 133 };

    const { bearishPeaks } = extractSwingSegments(candles, 0.10, 40);

    expect(bearishPeaks.length).toBeGreaterThanOrEqual(1);
    const peak = bearishPeaks.find(p => p.startIndex === 20);
    expect(peak).toBeDefined();
    expect(peak!.startPrice).toBe(150.0);
    expect(peak!.peakPrice).toBe(132.0);
    expect(peak!.gainPct).toBe(-12.0);
  });

  it("TC-SW-05: Rebound multiplier profile and trough indicator feature attribution", () => {
    const candles = createFlatCandles(200, 100);

    // Swing 1 at bar 40: low volume contraction (volume 300 vs 1000) + big 40% rebound (100 -> 140)
    candles[39] = { ...candles[39], low: 98, close: 98 };
    candles[40] = { ...candles[40], open: 97, high: 98, low: 95.0, close: 96, volume: 300 };
    candles[55] = { ...candles[55], open: 130, high: 133.0, low: 129, close: 132 }; // +40% from 95

    // Swing 2 at bar 100: low volume contraction + big 30% rebound (95 -> 123.5)
    candles[99] = { ...candles[99], low: 98, close: 98 };
    candles[100] = { ...candles[100], open: 97, high: 98, low: 95.0, close: 96, volume: 300 };
    candles[115] = { ...candles[115], open: 121, high: 123.5, low: 120, close: 122 }; // +30% from 95

    // Swing 3 at bar 150: normal volume + modest 12% rebound (95 -> 106.4)
    candles[149] = { ...candles[149], low: 98, close: 98 };
    candles[150] = { ...candles[150], open: 97, high: 98, low: 95.0, close: 96, volume: 1200 };
    candles[165] = { ...candles[165], open: 105, high: 106.4, low: 104, close: 106 }; // +12% from 95

    const timeline = buildFeatureTimeline(candles);
    const { successfulSwings } = extractSwingSegments(candles, 0.10, 30);
    const enriched = enrichSwingsWithFeatures(successfulSwings, timeline);
    const profile = buildMagnitudeProfile(enriched, timeline, 0.10);

    expect(enriched.length).toBe(3);
    expect(enriched[0].multiplier).toBe(1.4);
    expect(enriched[0].entryFeatures).toBeDefined();
    expect(enriched[0].entryFeatures!.volumeRatio20).toBeLessThan(0.5);

    expect(profile.maxGainPct).toBe(40);
    expect(profile.maxMultiplier).toBe(1.4);
    expect(profile.avgGainPct).toBeCloseTo(27.33, 1);

    const volDriver = profile.topMagnitudeDrivers.find(d => d.atom.type === "volume_ratio");
    expect(volDriver).toBeDefined();
    expect(volDriver!.avgGainWhenPresent).toBe(35);
    expect(volDriver!.liftVsBaselinePct).toBeGreaterThan(5);
  });
});
