export type MarketCode = "CN" | "HK" | "US" | "JP";
export type TimeframeCode = "daily" | "weekly";

/**
 * Historical key level calculated from past statistics
 */
export interface HindsightKeyLevel {
  kind: "entry" | "support" | "resistance" | "breakdown";
  price: number;                    // Calculated trigger price at current K-line
  distancePct: number;              // Distance from current latest close (e.g. -3.2 means -3.2%)
  sourceRuleTitle: string;          // Source rule description, e.g. "EMA60 ±2% support (8 holds in 9 touches)"
  suggestedStop?: number;           // Suggested initial stop loss (support * (1 - pierce80))
  bufferPct?: number;               // Recommended soft line buffer % (e.g. 2.1)
  touches?: number;                 // Total historical touch count
  falseBreakRate?: number;          // Historical false breakdown rate
  indicatorRef?: {                  // Structured indicator reference for charts or discipline tool
    type: "EMA" | "MA" | "HORIZONTAL" | "FIB" | "VPVR" | "COMPOSITE";
    period?: number;                // e.g. 60 for EMA60
    recommendedConfirmDays?: 1 | 2; // Recommended confirmation days from false breakdown stats
    historicalTouchCount: number;
    historicalHoldRate: number;     // 0~1, e.g. 0.889
    maxPierceDepthPct80: number;    // 80th percentile of intraday pierce depth during holds (%)
  };
}

/**
 * Summary output contract for rooftop-hindsight
 */
export interface HindsightSummaryPayload {
  version: "hindsight-v1";
  symbol: string;
  market: MarketCode;
  name?: string;
  analyzedAt: string;               // ISO timestamp
  lookbackYears: number;
  timeframe: TimeframeCode;
  minSwingPct: number;
  currentPrice: number;
  activeSignals: {                  // Currently triggered or near-trigger high-win-rate rules
    title: string;
    category: "bullish_entry" | "support_hold" | "breakdown_risk" | "bearish_peak";
    winRate: number;
    baselineWinRate: number;
    triggerCount: number;
    oosStatus: "oos_validated" | "oos_untested" | "oos_degraded";
  }[];
  keyLevels: HindsightKeyLevel[];   // Current reference entry, support, resistance, breakdown levels
}

/**
 * Lightweight interop protocol for trade-discipline calculator URL params
 * Example: /calculator?symbol=7203.T&entry=2600&refSupport=2450&suggestedStop=2398&bufferPct=2.1&maType=EMA&maPeriod=60&confirm=2
 */
export interface CrossToolUrlParams {
  symbol: string;
  entry?: number;
  refSupport?: number;              // Reference support price
  suggestedStop?: number;           // Suggested initial stop loss (support * (1 - pierce80))
  bufferPct?: number;               // Soft-line buffer percentage
  refTarget?: number;               // Reference resistance/target price
  maType?: "EMA" | "MA";            // Moving average type
  maPeriod?: 5 | 10 | 20 | 30 | 60; // Period
  confirm?: 1 | 2;                  // Confirmation days
}

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number;
}

/**
 * Builds a valid HindsightKeyLevel ensuring all contract fields are populated.
 */
export function exportKeyLevel(params: {
  kind: HindsightKeyLevel["kind"];
  price: number;
  currentPrice: number;
  sourceRuleTitle: string;
  pierce80Pct?: number; // e.g. 2.1%
  touches?: number;
  holdRate?: number;
  falseBreakRate?: number;
  maType?: "EMA" | "MA";
  maPeriod?: number;
  confirmDays?: 1 | 2;
}): HindsightKeyLevel {
  const distancePct = Number((((params.price - params.currentPrice) / params.currentPrice) * 100).toFixed(2));
  const bufferPct = params.pierce80Pct !== undefined ? Number(Math.max(1.0, params.pierce80Pct).toFixed(2)) : 2.0;
  const suggestedStop = Number((params.price * (1 - bufferPct / 100)).toFixed(2));

  return {
    kind: params.kind,
    price: params.price,
    distancePct,
    sourceRuleTitle: params.sourceRuleTitle,
    suggestedStop,
    bufferPct,
    touches: params.touches ?? 0,
    falseBreakRate: params.falseBreakRate ?? 0,
    indicatorRef: params.maType ? {
      type: params.maType,
      period: params.maPeriod,
      recommendedConfirmDays: params.confirmDays ?? (params.falseBreakRate && params.falseBreakRate > 0.4 ? 2 : 1),
      historicalTouchCount: params.touches ?? 0,
      historicalHoldRate: params.holdRate ?? 1.0,
      maxPierceDepthPct80: bufferPct,
    } : undefined,
  };
}

/**
 * Formats HindsightKeyLevel into CrossToolUrlParams for trade-discipline
 */
export function keyLevelToCrossToolParams(
  level: HindsightKeyLevel,
  symbol: string,
  currentPrice?: number,
  expectedReboundPct?: number
): CrossToolUrlParams {
  const res: CrossToolUrlParams = {
    symbol,
    entry: currentPrice ?? level.price,
    refSupport: level.price,
    suggestedStop: level.suggestedStop ?? Number((level.price * 0.98).toFixed(2)),
    bufferPct: level.bufferPct ?? 2.0,
  };

  if (typeof expectedReboundPct === "number" && expectedReboundPct > 0) {
    const baseEntry = currentPrice ?? level.price;
    res.refTarget = Number((baseEntry * (1 + expectedReboundPct / 100)).toFixed(2));
  }

  if (level.indicatorRef?.type === "EMA" || level.indicatorRef?.type === "MA") {
    res.maType = level.indicatorRef.type;
    const period = level.indicatorRef.period;
    if (period === 5 || period === 10 || period === 20 || period === 30 || period === 60) {
      res.maPeriod = period;
    }
    if (level.indicatorRef.recommendedConfirmDays) {
      res.confirm = level.indicatorRef.recommendedConfirmDays;
    }
  }

  return res;
}

/**
 * Builds URL query string for trade-discipline calculator
 */
export function buildTradeDisciplineUrl(
  params: CrossToolUrlParams,
  baseUrl: string = "https://trade-discipline.internal/calculator"
): string {
  const query = new URLSearchParams();
  query.set("symbol", params.symbol);
  if (params.entry !== undefined) query.set("entry", String(params.entry));
  if (params.refSupport !== undefined) query.set("refSupport", String(params.refSupport));
  if (params.suggestedStop !== undefined) query.set("suggestedStop", String(params.suggestedStop));
  if (params.bufferPct !== undefined) query.set("bufferPct", String(params.bufferPct));
  if (params.refTarget !== undefined) query.set("refTarget", String(params.refTarget));
  if (params.maType) query.set("maType", params.maType);
  if (params.maPeriod) query.set("maPeriod", String(params.maPeriod));
  if (params.confirm) query.set("confirm", String(params.confirm));
  query.set("source", "rooftop-hindsight");

  return `${baseUrl}?${query.toString()}`;
}

