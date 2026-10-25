import { describe, it, expect } from "vitest";
import {
  validateAndSanitizeHypotheses,
  buildHypothesisPrompt,
  PipelinePromptContext,
} from "../aiPipeline";
import {
  exportKeyLevel,
  keyLevelToCrossToolParams,
  buildTradeDisciplineUrl,
  HindsightKeyLevel,
} from "../../shared-types/interop";

describe("aiContractAndInterop", () => {
  it("TC-AI-01: AI output ConditionDSL syntax whitelist validation", () => {
    const rawAiOutputWithJunk = [
      // 1. Valid hypothesis
      {
        id: "hypo_valid_1",
        category: "bullish_entry",
        title: "EMA60 附近且 J < 10",
        conditions: [
          { type: "price_near_ma", params: { maKey: "EMA60", minPct: -2.0, maxPct: 2.0 } },
          { type: "kdj_zone_or_cross", params: { mode: "j_below", threshold: 10 } },
        ],
        aiRationale: "Valid rationale",
      },
      // 2. Junk hypothesis with illegal/unwhitelisted condition types
      {
        id: "hypo_junk_1",
        category: "bullish_entry",
        title: "Malicious condition attempt",
        conditions: [
          { type: "execute_arbitrary_code", params: { cmd: "rm -rf /" } },
          { type: "unknown_future_indicator", params: { foo: "bar" } },
        ],
      },
      // 3. Partially valid hypothesis: one condition is unknown, one is valid
      {
        id: "hypo_partial_1",
        category: "support_hold",
        title: "Partial valid",
        conditions: [
          { type: "unsupported_indicator", params: {} },
          { type: "rsi_zone", params: { mode: "below", threshold: 30 } },
        ],
      },
      // 4. Empty or invalid category
      {
        id: "hypo_bad_category",
        category: "unknown_crazy_category",
        title: "Bad category fallback",
        conditions: [
          { type: "macd_state", params: { mode: "golden_cross" } },
        ],
      },
    ];

    const sanitized = validateAndSanitizeHypotheses(rawAiOutputWithJunk);

    // hypo_junk_1 should be completely discarded because it has 0 valid conditions
    expect(sanitized.length).toBe(3);

    // 1. First one retains both conditions
    expect(sanitized[0].id).toBe("hypo_valid_1");
    expect(sanitized[0].conditions.length).toBe(2);

    // 2. hypo_partial_1 retains only the valid rsi_zone condition
    expect(sanitized[1].id).toBe("hypo_partial_1");
    expect(sanitized[1].conditions.length).toBe(1);
    expect(sanitized[1].conditions[0].type).toBe("rsi_zone");

    // 3. hypo_bad_category should default to bullish_entry
    expect(sanitized[2].id).toBe("hypo_bad_category");
    expect(sanitized[2].category).toBe("bullish_entry");
    expect(sanitized[2].conditions[0].type).toBe("macd_state");
  });

  it("TC-AI-02: Input parameters adaptive fine-tuning (minSwingPct = 0.15 synchronizes to 15%)", () => {
    const ctx: PipelinePromptContext = {
      symbol: "600519",
      market: "CN",
      minSwingPct: 0.15, // 15% non-default
      horizonBars: 45,
      totalBars: 500,
      swingsCount: 12,
      avgSwingGainPct: 0.22,
      medianSwingDuration: 25,
      topAtoms: [
        {
          atom: { type: "kdj_zone_or_cross", params: { mode: "j_below", threshold: 10 } },
          label: "KDJ: J < 10",
          successRateInSwings: 0.83,
          hitCountInSwings: 10,
          totalSwings: 12,
          hitCountInFails: 2,
          totalFails: 10,
          separationRatio: 0.63,
        },
      ],
      keyLevels: [
        {
          maKey: "EMA60",
          totalTouches: 8,
          totalHolds: 7,
          holdRate: 0.875,
          totalBreakdowns: 1,
          totalFalseBreaks: 2,
          falseBreakRate: 0.286,
          maxPierceDepthPctMedian: 1.2,
          maxPierceDepthPct80: 2.1,
          recommendedConfirmDays: 1,
        },
      ],
    };

    const prompt = buildHypothesisPrompt(ctx);

    // Must mention 15% in prompt
    expect(prompt).toContain("15%");
    expect(prompt).toContain("600519");
    expect(prompt).toContain("EMA60");
    expect(prompt).toContain("45 根K线");
  });

  it("TC-IO-01: Cross-tool contract fields integrity and URL serialization", () => {
    // 1. Export key level with statistical parameters
    const keyLevel: HindsightKeyLevel = exportKeyLevel({
      kind: "support",
      price: 2450,
      currentPrice: 2550,
      sourceRuleTitle: "EMA60 均线支撑 (7/8 次成功防守)",
      pierce80Pct: 2.1,
      touches: 8,
      holdRate: 0.875,
      falseBreakRate: 0.286,
      maType: "EMA",
      maPeriod: 60,
      confirmDays: 1,
    });

    // Check all required contract fields
    expect(keyLevel.kind).toBe("support");
    expect(keyLevel.price).toBe(2450);
    expect(keyLevel.touches).toBe(8);
    expect(keyLevel.bufferPct).toBe(2.1);
    expect(keyLevel.falseBreakRate).toBe(0.286);
    // suggestedStop should be price * (1 - 0.021) = 2450 * 0.979 = 2398.55
    expect(keyLevel.suggestedStop).toBe(2398.55);
    expect(keyLevel.indicatorRef).toBeDefined();
    expect(keyLevel.indicatorRef?.type).toBe("EMA");
    expect(keyLevel.indicatorRef?.period).toBe(60);
    expect(keyLevel.indicatorRef?.recommendedConfirmDays).toBe(1);

    // 2. Convert to URL params
    const crossParams = keyLevelToCrossToolParams(keyLevel, "7203.T", 2600);
    expect(crossParams.symbol).toBe("7203.T");
    expect(crossParams.entry).toBe(2600);
    expect(crossParams.refSupport).toBe(2450);
    expect(crossParams.suggestedStop).toBe(2398.55);
    expect(crossParams.bufferPct).toBe(2.1);
    expect(crossParams.maType).toBe("EMA");
    expect(crossParams.maPeriod).toBe(60);
    expect(crossParams.confirm).toBe(1);

    // 3. Generate trade-discipline URL
    const url = buildTradeDisciplineUrl(crossParams, "https://discipline.example.com/calculator");
    expect(url).toContain("symbol=7203.T");
    expect(url).toContain("entry=2600");
    expect(url).toContain("refSupport=2450");
    expect(url).toContain("suggestedStop=2398.55");
    expect(url).toContain("bufferPct=2.1");
    expect(url).toContain("maType=EMA");
    expect(url).toContain("maPeriod=60");
    expect(url).toContain("confirm=1");
    expect(url).toContain("source=rooftop-hindsight");
  });
});
