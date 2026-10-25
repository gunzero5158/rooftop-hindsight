import { describe, it, expect } from "vitest";
import { Candle } from "@/lib/shared-types/interop";
import { buildFeatureTimeline } from "../featureTimeline";
import { evaluateHypothesis } from "../hypothesisEvaluator";
import { HindsightHypothesis } from "../types";

function createCandles(count: number, basePrice: number = 100): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    candles.push({
      date: `2024-01-01`,
      open: basePrice,
      high: basePrice + 0.1,
      low: basePrice - 0.1,
      close: basePrice,
      volume: 1000,
    });
  }
  return candles;
}

describe("hypothesisEvaluator", () => {
  it("TC-EV-01: Synthetic price sequence exact win rate test (10 triggers, 8 wins = 80%)", () => {
    // 10 cycles, each cycle 50 bars. Total 550 bars.
    const candles: Candle[] = [];
    let currentPrice = 100;

    for (let c = 0; c < 10; c++) {
      const isWin = c < 8; // 8 wins, 2 losses

      // 10 bars flat before drop
      for (let i = 0; i < 10; i++) {
        candles.push({
          date: `2024-01-01`,
          open: currentPrice,
          high: currentPrice + 0.1,
          low: currentPrice - 0.1,
          close: currentPrice,
          volume: 1000,
        });
      }

      // 2 bars drop to trigger J < 10
      // Bar 1: drop 4
      const p1 = currentPrice - 4;
      candles.push({
        date: `2024-01-01`,
        open: currentPrice,
        high: currentPrice,
        low: p1,
        close: p1,
        volume: 1000,
      });

      // Bar 2 (trigger bar): drop another 4
      const triggerPrice = currentPrice - 8;
      candles.push({
        date: `2024-01-01`,
        open: p1,
        high: p1,
        low: triggerPrice - 0.5,
        close: triggerPrice,
        volume: 1000,
      });

      if (isWin) {
        // Rally > 15% and stay flat
        const winPrice = Number((triggerPrice * 1.15).toFixed(2));
        for (let i = 0; i < 38; i++) {
          candles.push({
            date: `2024-01-01`,
            open: winPrice,
            high: winPrice + 0.1,
            low: winPrice - 0.1,
            close: winPrice,
            volume: 1000,
          });
        }
        currentPrice = winPrice;
      } else {
        // Loss: flat at triggerPrice + 1 (never reaches +10%)
        const lossPrice = triggerPrice + 1;
        for (let i = 0; i < 38; i++) {
          candles.push({
            date: `2024-01-01`,
            open: lossPrice,
            high: lossPrice + 0.1,
            low: lossPrice - 0.1,
            close: lossPrice,
            volume: 1000,
          });
        }
        currentPrice = lossPrice;
      }
    }

    const timeline = buildFeatureTimeline(candles);

    const hypothesis: HindsightHypothesis = {
      id: "test_tc_ev_01",
      category: "bullish_entry",
      title: "J < 10",
      conditions: [
        { type: "kdj_zone_or_cross", params: { mode: "j_below", threshold: 10 } },
      ],
      aiRationale: "Test hypothesis",
    };

    const res = evaluateHypothesis(candles, timeline, hypothesis, {
      minSwingPct: 0.10,
      horizonBars: 35,
      cooldownBars: 5,
    });

    expect(res.triggerCount).toBe(10);
    expect(res.winCount).toBe(8);
    expect(res.winRate).toBe(0.80);
  });

  it("TC-EV-02: Cluster cooldown deduplication (3 consecutive trigger days counted as 1 wave trigger)", () => {
    const candles = createCandles(200, 100);

    // Bars 65..69 at 104 so range is set
    for (let j = 65; j < 70; j++) {
      candles[j] = { ...candles[j], open: 103, high: 104.5, low: 103, close: 104 };
    }

    // Bars 70, 71, 72 all satisfy condition
    candles[70] = { ...candles[70], open: 98, high: 98.5, low: 96.0, close: 96.5 };
    candles[71] = { ...candles[71], open: 97, high: 97.5, low: 95.5, close: 96.0 };
    candles[72] = { ...candles[72], open: 96.5, high: 97.0, low: 95.0, close: 95.5 };

    // Then rallies to 115 (+15%) and stays up until the end of the test (no cliff-dive)
    for (let k = 73; k < 200; k++) {
      candles[k] = { ...candles[k], open: 114, high: 116, low: 113, close: 115 };
    }

    const timeline = buildFeatureTimeline(candles);

    const hypothesis: HindsightHypothesis = {
      id: "test_tc_ev_02",
      category: "bullish_entry",
      title: "J < 10",
      conditions: [
        { type: "kdj_zone_or_cross", params: { mode: "j_below", threshold: 10 } },
      ],
      aiRationale: "Cooldown test",
    };

    const res = evaluateHypothesis(candles, timeline, hypothesis, {
      minSwingPct: 0.10,
      horizonBars: 40,
      cooldownBars: 5,
    });

    // Merged into 1 trigger with 1 win
    expect(res.triggerCount).toBe(1);
    expect(res.winCount).toBe(1);
    expect(res.winRate).toBe(1.0);
  });

  it("TC-EV-03: 70/30 OOS zero-trigger vs degradation distinction", () => {
    const hypothesis: HindsightHypothesis = {
      id: "test_tc_ev_03",
      category: "bullish_entry",
      title: "J < 10",
      conditions: [{ type: "kdj_zone_or_cross", params: { mode: "j_below", threshold: 10 } }],
      aiRationale: "Scenario test",
    };

    function buildSequence(isLossInOos: boolean): Candle[] {
      const candles: Candle[] = [];
      let cur = 100;
      // 4 cycles in IS (each 50 bars)
      for (let c = 0; c < 4; c++) {
        for (let i = 0; i < 10; i++) {
          candles.push({ date: "2024-01-01", open: cur, high: cur + 0.1, low: cur - 0.1, close: cur, volume: 1000 });
        }
        const p1 = cur - 4;
        candles.push({ date: "2024-01-01", open: cur, high: cur, low: p1, close: p1, volume: 1000 });
        const triggerP = cur - 8;
        candles.push({ date: "2024-01-01", open: p1, high: p1, low: triggerP - 0.5, close: triggerP, volume: 1000 });
        const winP = Number((triggerP * 1.15).toFixed(2));
        for (let i = 0; i < 38; i++) {
          candles.push({ date: "2024-01-01", open: winP, high: winP + 0.1, low: winP - 0.1, close: winP, volume: 1000 });
        }
        cur = winP;
      }

      // Now we have 200 bars in IS. Next 100 bars (OOS >= 70%)
      if (!isLossInOos) {
        // Just flatline, no triggers
        for (let i = 0; i < 100; i++) {
          candles.push({ date: "2024-01-01", open: cur, high: cur + 0.1, low: cur - 0.1, close: cur, volume: 1000 });
        }
      } else {
        // 2 loss cycles in OOS (each 45 bars)
        for (let c = 0; c < 2; c++) {
          for (let i = 0; i < 10; i++) {
            candles.push({ date: "2024-01-01", open: cur, high: cur + 0.1, low: cur - 0.1, close: cur, volume: 1000 });
          }
          const p1 = cur - 4;
          candles.push({ date: "2024-01-01", open: cur, high: cur, low: p1, close: p1, volume: 1000 });
          const triggerP = cur - 8;
          candles.push({ date: "2024-01-01", open: p1, high: p1, low: triggerP - 0.5, close: triggerP, volume: 1000 });
          const lossP = triggerP + 1;
          for (let i = 0; i < 33; i++) {
            candles.push({ date: "2024-01-01", open: lossP, high: lossP + 0.1, low: lossP - 0.1, close: lossP, volume: 1000 });
          }
          cur = lossP;
        }
      }
      return candles;
    }

    // Scenario A: 0 triggers in OOS
    const candlesA = buildSequence(false);
    const timelineA = buildFeatureTimeline(candlesA);
    const resA = evaluateHypothesis(candlesA, timelineA, hypothesis, { minSwingPct: 0.10 });

    expect(resA.oosTriggerCount).toBe(0);
    expect(resA.oosStatus).toBe("oos_untested");

    // Scenario B: >= 2 triggers in OOS, all lose
    const candlesB = buildSequence(true);
    const timelineB = buildFeatureTimeline(candlesB);
    const resB = evaluateHypothesis(candlesB, timelineB, hypothesis, { minSwingPct: 0.10 });

    expect(resB.oosTriggerCount).toBeGreaterThanOrEqual(2);
    expect(resB.oosWinRate).toBe(0);
    expect(resB.oosStatus).toBe("oos_degraded");
  });

  it("TC-EV-04: Insufficient sample threshold intercept (< 8 triggers flagged insufficient_sample)", () => {
    // 4 cycles, all win
    const candles: Candle[] = [];
    let cur = 100;
    for (let c = 0; c < 4; c++) {
      for (let i = 0; i < 10; i++) {
        candles.push({ date: "2024-01-01", open: cur, high: cur + 0.1, low: cur - 0.1, close: cur, volume: 1000 });
      }
      const p1 = cur - 4;
      candles.push({ date: "2024-01-01", open: cur, high: cur, low: p1, close: p1, volume: 1000 });
      const triggerP = cur - 8;
      candles.push({ date: "2024-01-01", open: p1, high: p1, low: triggerP - 0.5, close: triggerP, volume: 1000 });
      const winP = Number((triggerP * 1.15).toFixed(2));
      for (let i = 0; i < 38; i++) {
        candles.push({ date: "2024-01-01", open: winP, high: winP + 0.1, low: winP - 0.1, close: winP, volume: 1000 });
      }
      cur = winP;
    }

    const timeline = buildFeatureTimeline(candles);
    const hypothesis: HindsightHypothesis = {
      id: "test_tc_ev_04",
      category: "bullish_entry",
      title: "J < 10",
      conditions: [{ type: "kdj_zone_or_cross", params: { mode: "j_below", threshold: 10 } }],
      aiRationale: "Sample gate test",
    };

    const res = evaluateHypothesis(candles, timeline, hypothesis, { minTriggers: 8 });

    expect(res.triggerCount).toBe(4);
    expect(res.winRate).toBe(1.0);
    expect(res.status).toBe("insufficient_sample");
  });
});
