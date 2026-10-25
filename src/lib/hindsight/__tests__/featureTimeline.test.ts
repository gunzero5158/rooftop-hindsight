import { describe, it, expect } from "vitest";
import { Candle } from "@/lib/shared-types/interop";
import { generateSyntheticCandles } from "@/lib/market/mockMarketData";
import { buildFeatureTimeline } from "../featureTimeline";

describe("featureTimeline", () => {
  it("TC-FT-01: Zero future-leak truncation consistency test", () => {
    const fullCandles = generateSyntheticCandles(300, 100, 12345);
    const targetIndex = 150;

    // Full timeline
    const fullTimeline = buildFeatureTimeline(fullCandles);
    const fFull = fullTimeline[targetIndex];

    // Sliced timeline: strictly candles 0..150
    const slicedCandles = fullCandles.slice(0, targetIndex + 1);
    const slicedTimeline = buildFeatureTimeline(slicedCandles);
    const fSliced = slicedTimeline[targetIndex];

    // Assert exact equality for all indicators at targetIndex
    expect(fSliced.close).toBe(fFull.close);
    expect(fSliced.mas).toEqual(fFull.mas);
    expect(fSliced.maDistancesPct).toEqual(fFull.maDistancesPct);
    expect(fSliced.consecutiveBarsBelow).toEqual(fFull.consecutiveBarsBelow);
    expect(fSliced.kdj).toEqual(fFull.kdj);
    expect(fSliced.rsi).toBe(fFull.rsi);
    expect(fSliced.macd).toEqual(fFull.macd);
    expect(fSliced.fibLevels).toEqual(fFull.fibLevels);
    expect(fSliced.vpvr).toEqual(fFull.vpvr);
  });

  it("TC-FT-02: Consecutive bars below MA count sequence", () => {
    // Sequence: [above, below, below, above, below, below, below]
    // Expected consecutiveBarsBelow.EMA5: [0, 1, 2, 0, 1, 2, 3]
    const baseCandles: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      baseCandles.push({
        date: `2025-01-${String(i + 1).padStart(2, "0")}`,
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1000,
      });
    }

    // Now append the sequence
    // EMA5 will be around 100
    const closes = [105, 95, 94, 106, 93, 92, 91];
    for (let i = 0; i < closes.length; i++) {
      baseCandles.push({
        date: `2025-02-${String(i + 1).padStart(2, "0")}`,
        open: closes[i],
        high: closes[i] + 1,
        low: closes[i] - 1,
        close: closes[i],
        volume: 1000,
      });
    }

    const timeline = buildFeatureTimeline(baseCandles);
    const subTimeline = timeline.slice(20);

    const counts = subTimeline.map(t => t.consecutiveBarsBelow["EMA5"]);
    expect(counts).toEqual([0, 1, 2, 0, 1, 2, 3]);
  });

  it("TC-FT-03: Long lower shadow and hammer recognition", () => {
    const candles: Candle[] = [
      { date: "2025-01-01", open: 105, high: 106, low: 104, close: 105, volume: 1000 },
      { date: "2025-01-02", open: 104, high: 105, low: 103, close: 103.5, volume: 1000 },
      // Hammer: Open 102, High 103, Low 96, Close 101.5
      // Range = 7, Body = 0.5, Lower shadow = 101.5 - 96 = 5.5 (5.5 / 7 = 78.5% > 65%)
      { date: "2025-01-03", open: 102, high: 103, low: 96, close: 101.5, volume: 2000 },
    ];

    const timeline = buildFeatureTimeline(candles);
    const patterns = timeline[2].candlestickPatterns;

    expect(patterns.has("long_lower_shadow")).toBe(true);
    expect(patterns.has("hammer")).toBe(true);
  });
});
