import { Candle, HindsightKeyLevel, HindsightSummaryPayload, MarketCode, TimeframeCode, exportKeyLevel } from "../shared-types/interop";
import { AtomPreScanResult, buildMagnitudeProfile, checkAtomCondition, enrichSwingsWithFeatures, preScanAllAtoms } from "./univariatePreScan";
import { KeyLevelTouchStat, scanAllKeyLevels } from "./keyLevelStats";
import { ConditionAtom, EvaluationResult, HindsightHypothesis, MagnitudeProfile, SwingSegment } from "./types";
import { generateLocalHypotheses } from "./gridSearchFallback";
import { evaluateHypothesis } from "./hypothesisEvaluator";
import { extractSwings } from "./swingExtractor";
import { buildFeatureTimeline } from "./featureTimeline";

export const ALLOWED_CATEGORIES = new Set([
  "bullish_entry",
  "support_hold",
  "breakdown_risk",
  "bearish_peak",
]);

export const ALLOWED_ATOM_TYPES = new Set([
  "price_near_ma",
  "kdj_zone_or_cross",
  "rsi_zone",
  "macd_state",
  "candlestick_pattern",
  "fib_retracement_near",
  "vpvr_zone_near",
  "volume_ratio",
  "ma_consecutive_break",
  "ma_slope_direction",
]);

export interface PipelinePromptContext {
  symbol: string;
  market: MarketCode;
  minSwingPct: number;
  horizonBars: number;
  totalBars: number;
  swingsCount: number;
  avgSwingGainPct: number;
  medianSwingDuration: number;
  topAtoms: AtomPreScanResult[];
  keyLevels: KeyLevelTouchStat[];
}

/**
 * Builds the structured prompt for LLM single-round hypothesis generation.
 */
export function buildHypothesisPrompt(ctx: PipelinePromptContext): string {
  const topAtomsText = ctx.topAtoms
    .slice(0, 8)
    .map(
      (a, i) =>
        `${i + 1}. [${a.label}] 在历史波段启动时命中率: ${(a.successRateInSwings * 100).toFixed(1)}%, 区分度: ${(a.separationRatio * 100).toFixed(1)}%`
    )
    .join("\n");

  const keyLevelsText = ctx.keyLevels
    .filter(k => k.totalTouches >= 3)
    .slice(0, 5)
    .map(
      k =>
        `- ${k.maKey}: 触碰 ${k.totalTouches} 次, 防守成功率 ${(k.holdRate * 100).toFixed(1)}%, 假跌破率 ${(k.falseBreakRate * 100).toFixed(1)}%, 80分位下影刺穿深度 ${k.maxPierceDepthPct80}%`
    )
    .join("\n");

  const minSwingPctStr = `${(ctx.minSwingPct * 100).toFixed(0)}%`;

  return `你是一个专业量化历史共性挖掘分析师。
我们要对标的 ${ctx.symbol} (${ctx.market}) 进行历史拐点共性特征挖掘。
目标：寻找历史价格在启动至少上涨 ${minSwingPctStr}（前瞻 ${ctx.horizonBars} 根K线）前的共性指标特征与支撑防守规律。

【历史波段背景】
- 有效上涨波段数: ${ctx.swingsCount} 个
- 平均上涨波段幅度: ${(ctx.avgSwingGainPct * 100).toFixed(1)}%
- 波段平均持续天数: ${ctx.medianSwingDuration} 根K线

【单指标特征预扫描 Top 表现】
${topAtomsText || "暂无显著单指标"}

【均线历史触碰防守统计】
${keyLevelsText || "暂无显著均线支撑"}

【要求】
结合上述统计，设计 3~6 个高质量的启动买点或支撑防守组合假设 (ConditionDSL)。
每个假设必须由 1~3 个原子条件组成。只允许输出 JSON 数组，严禁其他解释文本。
允许的 condition type 及其参数必须严格遵照白名单：
- price_near_ma: { maKey: "EMA60"|"MA20"|..., minPct: number, maxPct: number }
- kdj_zone_or_cross: { mode: "j_below"|"j_above"|"golden_cross"|"death_cross", threshold: number }
- rsi_zone: { mode: "below"|"above", threshold: number }
- macd_state: { mode: "golden_cross"|"bottom_divergence"|"top_divergence"|"hist_positive" }
- candlestick_pattern: { pattern: "hammer"|"morning_star"|"bullish_engulfing"|"piercing_line"|"doji" }
- fib_retracement_near: { ratio: 0.382|0.5|0.618, tolerancePct: number }
- volume_ratio: { mode: "below"|"above", threshold: number }
- ma_slope_direction: { maKey: string, direction: "up"|"down"|"flat" }

JSON 格式规范:
[
  {
    "id": "hypo_1",
    "category": "bullish_entry",
    "title": "简明标题",
    "conditions": [
      { "type": "price_near_ma", "params": { "maKey": "EMA60", "minPct": -2.5, "maxPct": 2.5 } },
      { "type": "kdj_zone_or_cross", "params": { "mode": "j_below", "threshold": 10 } }
    ],
    "aiRationale": "依据历史统计..."
  }
]`;
}

/**
 * Validates and sanitizes ConditionAtom to ensure whitelist safety (TC-AI-01).
 */
export function sanitizeConditionAtom(raw: unknown): ConditionAtom | null {
  if (!raw || typeof raw !== "object") return null;
  const atom = raw as Record<string, unknown>;
  const type = String(atom.type);

  if (!ALLOWED_ATOM_TYPES.has(type)) {
    return null;
  }

  const params = (atom.params && typeof atom.params === "object" ? atom.params : {}) as Record<string, unknown>;
  const cleanParams: Record<string, string | number | boolean> = {};

  switch (type) {
    case "price_near_ma": {
      const maKey = String(params.maKey || "EMA60");
      if (!maKey.startsWith("EMA") && !maKey.startsWith("MA")) return null;
      cleanParams.maKey = maKey;
      cleanParams.minPct = typeof params.minPct === "number" ? params.minPct : -2.5;
      cleanParams.maxPct = typeof params.maxPct === "number" ? params.maxPct : 2.5;
      break;
    }
    case "kdj_zone_or_cross": {
      const mode = String(params.mode || "j_below");
      if (!["j_below", "j_above", "golden_cross", "death_cross"].includes(mode)) return null;
      cleanParams.mode = mode;
      cleanParams.threshold = typeof params.threshold === "number" ? params.threshold : 10;
      break;
    }
    case "rsi_zone": {
      const mode = String(params.mode || "below");
      if (!["below", "above"].includes(mode)) return null;
      cleanParams.mode = mode;
      cleanParams.threshold = typeof params.threshold === "number" ? params.threshold : 35;
      break;
    }
    case "macd_state": {
      const mode = String(params.mode || "golden_cross");
      if (!["golden_cross", "bottom_divergence", "top_divergence", "hist_positive"].includes(mode)) return null;
      cleanParams.mode = mode;
      break;
    }
    case "candlestick_pattern": {
      const pattern = String(params.pattern || "hammer");
      cleanParams.pattern = pattern;
      break;
    }
    case "fib_retracement_near": {
      cleanParams.ratio = typeof params.ratio === "number" ? params.ratio : 0.618;
      cleanParams.tolerancePct = typeof params.tolerancePct === "number" ? params.tolerancePct : 2.0;
      break;
    }
    case "vpvr_zone_near": {
      cleanParams.target = "poc";
      cleanParams.tolerancePct = typeof params.tolerancePct === "number" ? params.tolerancePct : 2.0;
      break;
    }
    case "volume_ratio": {
      const mode = String(params.mode || "below");
      cleanParams.mode = mode === "above" ? "above" : "below";
      cleanParams.threshold = typeof params.threshold === "number" ? params.threshold : 0.8;
      break;
    }
    case "ma_consecutive_break": {
      cleanParams.maKey = String(params.maKey || "EMA5");
      cleanParams.days = typeof params.days === "number" ? params.days : 2;
      break;
    }
    case "ma_slope_direction": {
      cleanParams.maKey = String(params.maKey || "EMA60");
      const dir = String(params.direction || "up");
      cleanParams.direction = ["up", "down", "flat"].includes(dir) ? dir : "up";
      break;
    }
    default:
      return null;
  }

  return {
    type: type as ConditionAtom["type"],
    params: cleanParams,
  };
}

/**
 * Validates an array of raw hypotheses against DSL schema, filtering illegal items (TC-AI-01).
 */
export function validateAndSanitizeHypotheses(rawList: unknown): HindsightHypothesis[] {
  if (!Array.isArray(rawList)) return [];

  const validHypotheses: HindsightHypothesis[] = [];

  for (let i = 0; i < rawList.length; i++) {
    const raw = rawList[i];
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;

    const id = typeof item.id === "string" && item.id.length > 0 ? item.id : `hypo_${i + 1}`;
    const rawCategory = typeof item.category === "string" ? item.category : "bullish_entry";
    const category = ALLOWED_CATEGORIES.has(rawCategory) ? (rawCategory as HindsightHypothesis["category"]) : "bullish_entry";
    const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : `历史共性规则 ${i + 1}`;
    const aiRationale = typeof item.aiRationale === "string" ? item.aiRationale : "由量化回测引擎自动生成的特征假设";

    if (!Array.isArray(item.conditions) || item.conditions.length === 0) {
      continue;
    }

    const validConditions: ConditionAtom[] = [];
    for (const rawAtom of item.conditions) {
      const cleanAtom = sanitizeConditionAtom(rawAtom);
      if (cleanAtom) {
        validConditions.push(cleanAtom);
      }
    }

    // Must have at least 1 valid condition
    if (validConditions.length > 0) {
      validHypotheses.push({
        id,
        category,
        title,
        conditions: validConditions,
        aiRationale,
      });
    }
  }

  return validHypotheses;
}

const STATUS_RANK: Record<EvaluationResult["status"], number> = {
  high_confidence: 0,
  degraded: 1,
  insufficient_sample: 2,
};

/**
 * Ranks results: reliable samples first, then win rate, then trigger count.
 */
export function rankResults(results: EvaluationResult[]): EvaluationResult[] {
  return [...results].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      b.winRate - a.winRate ||
      b.triggerCount - a.triggerCount
  );
}

/**
 * Executes full analysis pipeline for a given candle series.
 * Bars before `warmupBars` only stabilize indicators and are excluded from all statistics.
 */
export async function runHindsightPipeline(
  candles: Candle[],
  options: {
    symbol: string;
    market: MarketCode;
    name?: string;
    timeframe?: TimeframeCode;
    minSwingPct?: number;
    horizonBars?: number;
    warmupBars?: number;
    apiKey?: string;
    model?: string;
  }
): Promise<HindsightSummaryPayload & { hypothesesResults: EvaluationResult[]; swings: SwingSegment[]; magnitudeProfile: MagnitudeProfile; analysisStartIndex: number }> {
  const minSwingPct = options.minSwingPct ?? 0.10;
  const horizonBars = options.horizonBars ?? 40;
  const timeframe = options.timeframe ?? "daily";
  const symbol = options.symbol;
  const market = options.market;
  // Keep at least half of the series for analysis when history is short
  const startIndex = Math.min(options.warmupBars ?? 0, Math.floor(candles.length / 2));

  // 1. Swings & Timeline (timeline uses full series so warmup stabilizes indicators)
  const timeline = buildFeatureTimeline(candles);
  const rawSwings = extractSwings(candles, { minSwingPct, horizonBars }).filter(s => s.startIndex >= startIndex);
  const swings = enrichSwingsWithFeatures(rawSwings, timeline);

  // 2. Statistics & Magnitude / Multiplier Profile
  const keyLevelStats = scanAllKeyLevels(candles, timeline, startIndex);
  const preScanResults = preScanAllAtoms(candles, timeline, swings, minSwingPct, horizonBars, startIndex);
  const magnitudeProfile = buildMagnitudeProfile(swings, timeline, minSwingPct);

  // 3. Generate Hypotheses: local fallback is always generated to ensure stability
  const fallbackHypotheses = generateLocalHypotheses(preScanResults, keyLevelStats);
  let hypothesesToEvaluate = fallbackHypotheses;

  // If AI key provided or available in env, try generating AI hypotheses
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    try {
      // swing.gainPct is in percent; prompt context expects a fraction
      const avgGain = swings.length > 0 ? swings.reduce((acc, s) => acc + s.gainPct, 0) / swings.length / 100 : 0;
      const medianDur = swings.length > 0 ? swings.map(s => s.durationBars).sort((a, b) => a - b)[Math.floor(swings.length / 2)] : 20;

      const prompt = buildHypothesisPrompt({
        symbol,
        market,
        minSwingPct,
        horizonBars,
        totalBars: candles.length - startIndex,
        swingsCount: swings.length,
        avgSwingGainPct: avgGain,
        medianSwingDuration: medianDur,
        topAtoms: preScanResults,
        keyLevels: keyLevelStats,
      });

      // Call API if endpoint configured
      const aiResponse = await callAiProvider(prompt, apiKey, options.model);
      if (aiResponse) {
        const validated = validateAndSanitizeHypotheses(extractHypothesisArray(JSON.parse(aiResponse)));
        if (validated.length > 0) {
          // Merge validated AI hypotheses with top fallbacks
          hypothesesToEvaluate = [...validated, ...fallbackHypotheses.slice(0, 3)];
        }
      }
    } catch {
      // Gracefully fall back to local hypotheses on any error
      hypothesesToEvaluate = fallbackHypotheses;
    }
  }

  // 4. Evaluate each hypothesis (drop rules that never fired)
  const results = rankResults(
    hypothesesToEvaluate
      .map(h => evaluateHypothesis(candles, timeline, h, { minSwingPct, horizonBars, startIndex }))
      .filter(r => r.triggerCount > 0)
  );

  // 5. Evaluate current status at the latest candle
  const latestIndex = candles.length - 1;
  const latestFeature = timeline[latestIndex];
  const currentPrice = candles[latestIndex]?.close || 100;

  const activeSignals: HindsightSummaryPayload["activeSignals"] = [];
  for (const r of results) {
    const isTriggeredNow = r.hypothesis.conditions.every(c => checkAtomCondition(latestFeature, c));
    // Only reliable rules qualify as an active signal
    if (isTriggeredNow && r.status !== "insufficient_sample" && r.winRate >= 0.6) {
      activeSignals.push({
        title: r.hypothesis.title,
        category: r.hypothesis.category,
        winRate: r.winRate,
        baselineWinRate: r.baselineWinRate,
        triggerCount: r.triggerCount,
        oosStatus: r.oosStatus,
      });
    }
  }

  // 6. Synthesize current key levels from strong keyLevelStats
  const keyLevels: HindsightKeyLevel[] = [];
  const strongLevels = keyLevelStats
    .filter(k => k.totalTouches >= 2 && k.holdRate >= 0.5)
    .sort((a, b) => b.holdRate - a.holdRate);

  for (const lvl of strongLevels.slice(0, 4)) {
    const maVal = latestFeature.mas[lvl.maKey];
    if (maVal && Number.isFinite(maVal)) {
      const p = lvl.maKey.replace(/^(EMA|MA)/, "");
      const periodNum = parseInt(p, 10);
      const isEma = lvl.maKey.startsWith("EMA");

      keyLevels.push(
        exportKeyLevel({
          kind: "support",
          price: Number(maVal.toFixed(2)),
          currentPrice,
          sourceRuleTitle: `${lvl.maKey} 均线支撑 (${lvl.totalHolds}/${lvl.totalTouches} 次成功防守)`,
          pierce80Pct: lvl.maxPierceDepthPct80,
          touches: lvl.totalTouches,
          holdRate: lvl.holdRate,
          falseBreakRate: lvl.falseBreakRate,
          maType: isEma ? "EMA" : "MA",
          maPeriod: periodNum,
          confirmDays: lvl.recommendedConfirmDays,
        })
      );
    }
  }

  return {
    version: "hindsight-v1",
    symbol,
    market,
    name: options.name,
    analyzedAt: new Date().toISOString(),
    lookbackYears: Number(((candles.length - startIndex) / (timeframe === "weekly" ? 52 : 250)).toFixed(1)),
    timeframe,
    minSwingPct,
    currentPrice,
    activeSignals,
    keyLevels,
    hypothesesResults: results,
    swings,
    magnitudeProfile,
    analysisStartIndex: startIndex,
  };
}

/**
 * Accepts either a bare array or an object wrapping the array (json_object mode returns objects).
 */
function extractHypothesisArray(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const firstArray = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
    if (firstArray) return firstArray;
  }
  return [];
}

async function callAiProvider(prompt: string, apiKey: string, model?: string): Promise<string | null> {
  // Supports Gemini or OpenRouter endpoint
  const isOpenRouter = apiKey.startsWith("sk-or-");
  const url = isOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.5-flash"}:generateContent`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isOpenRouter) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    // Header auth keeps the key out of URLs and access logs
    headers["x-goog-api-key"] = apiKey;
  }

  const body = isOpenRouter
    ? JSON.stringify({
        model: model || "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      })
    : JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      });

  const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(30000) });
  if (!res.ok) return null;

  const data = await res.json();
  if (isOpenRouter) {
    return data.choices?.[0]?.message?.content || null;
  } else {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  }
}
