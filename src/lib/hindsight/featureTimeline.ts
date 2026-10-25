import { Candle } from "../shared-types/interop";
import {
  calculateATR,
  calculateBOLL,
  calculateEMA,
  calculateKDJ,
  calculateMACD,
  calculateRSI,
  calculateSMA,
  calculateVPVR,
} from "../indicators/indicators";
import { detectCandlestickPatterns } from "../indicators/candlestickPatterns";
import { calculateFibonacciRetracement } from "../indicators/fibonacci";
import { TimelineFeatures } from "./types";

const MA_PERIODS = [5, 10, 20, 30, 60, 120, 250];

/**
 * Builds the complete zero-future-leak feature timeline for a candle series.
 * Strict guarantee: Every feature at index i is computed using ONLY candles[0..i].
 */
export function buildFeatureTimeline(candles: Candle[]): TimelineFeatures[] {
  const n = candles.length;
  if (n === 0) return [];

  // 1. Moving Averages
  const emas: Record<string, number[]> = {};
  const smas: Record<string, number[]> = {};

  for (const p of MA_PERIODS) {
    emas[`EMA${p}`] = calculateEMA(candles, p);
    smas[`MA${p}`] = calculateSMA(candles, p);
  }

  // 2. Oscillators
  const kdj = calculateKDJ(candles);
  const rsi = calculateRSI(candles, 14);
  const macd = calculateMACD(candles);
  const atr = calculateATR(candles, 14);
  const boll = calculateBOLL(candles, 20, 2);

  // 3. Patterns
  const patternsList = detectCandlestickPatterns(candles);

  // 4. Volume 20 SMA
  const volumeCandles = candles.map(c => ({ ...c, close: c.volume }));
  const volSma20 = calculateSMA(volumeCandles, 20);

  // Track consecutive bars below MAs
  const consecutiveBarsBelowTracker: Record<string, number> = {};
  for (const p of MA_PERIODS) {
    consecutiveBarsBelowTracker[`EMA${p}`] = 0;
    consecutiveBarsBelowTracker[`MA${p}`] = 0;
  }

  const timeline: TimelineFeatures[] = [];

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const mas: Record<string, number> = {};
    const maDistancesPct: Record<string, number> = {};
    const maSlopes: Record<string, "up" | "down" | "flat"> = {};
    const consecutiveBarsBelow: Record<string, number> = {};

    for (const p of MA_PERIODS) {
      for (const [prefix, series] of [["EMA", emas[`EMA${p}`]], ["MA", smas[`MA${p}`]]] as const) {
        const key = `${prefix}${p}`;
        const val = series[i];
        mas[key] = val;

        if (Number.isFinite(val) && val > 0) {
          maDistancesPct[key] = Number((((c.close - val) / val) * 100).toFixed(2));
          
          // Slope over 3 bars
          if (i >= 3 && Number.isFinite(series[i - 3])) {
            const diff = (val - series[i - 3]) / series[i - 3];
            maSlopes[key] = diff > 0.001 ? "up" : diff < -0.001 ? "down" : "flat";
          } else {
            maSlopes[key] = "flat";
          }

          // Consecutive bars below
          if (c.close < val) {
            consecutiveBarsBelowTracker[key] = (consecutiveBarsBelowTracker[key] || 0) + 1;
          } else {
            consecutiveBarsBelowTracker[key] = 0;
          }
        } else {
          maDistancesPct[key] = NaN;
          maSlopes[key] = "flat";
          consecutiveBarsBelowTracker[key] = 0;
        }

        consecutiveBarsBelow[key] = consecutiveBarsBelowTracker[key];
      }
    }

    // KDJ
    const currentK = kdj.k[i] ?? 50;
    const currentD = kdj.d[i] ?? 50;
    const currentJ = kdj.j[i] ?? 50;
    let kdjCross: "golden" | "death" | "none" = "none";
    if (i >= 1) {
      const prevJ = kdj.j[i - 1] ?? 50;
      const prevK = kdj.k[i - 1] ?? 50;
      if (prevJ <= prevK && currentJ > currentK) kdjCross = "golden";
      else if (prevJ >= prevK && currentJ < currentK) kdjCross = "death";
    }

    // MACD
    const curDif = macd.dif[i] ?? 0;
    const curDea = macd.dea[i] ?? 0;
    const curHist = macd.hist[i] ?? 0;
    let macdCross: "golden" | "death" | "none" = "none";
    if (i >= 1) {
      const prevDif = macd.dif[i - 1] ?? 0;
      const prevDea = macd.dea[i - 1] ?? 0;
      if (prevDif <= prevDea && curDif > curDea) macdCross = "golden";
      else if (prevDif >= prevDea && curDif < curDea) macdCross = "death";
    }

    // MACD Divergence strictly looking back up to 40 bars in [0..i]
    let macdDivergence: "bottom" | "top" | "none" = "none";
    if (i >= 15) {
      let priorLowPrice = Infinity;
      let priorLowDif = Infinity;
      for (let j = Math.max(0, i - 40); j <= i - 5; j++) {
        if (candles[j].low < priorLowPrice) {
          priorLowPrice = candles[j].low;
          priorLowDif = macd.dif[j] ?? 0;
        }
      }
      if (c.low < priorLowPrice && curDif > priorLowDif && curHist > (macd.hist[i - 1] ?? 0)) {
        macdDivergence = "bottom";
      }

      let priorHighPrice = -Infinity;
      let priorHighDif = -Infinity;
      for (let j = Math.max(0, i - 40); j <= i - 5; j++) {
        if (candles[j].high > priorHighPrice) {
          priorHighPrice = candles[j].high;
          priorHighDif = macd.dif[j] ?? 0;
        }
      }
      if (c.high > priorHighPrice && curDif < priorHighDif && curHist < (macd.hist[i - 1] ?? 0)) {
        macdDivergence = "top";
      }
    }

    // Fibonacci Retracement within prior 60 bars in [0..i]
    const fibLookback = Math.max(0, i - 60);
    let swingHigh = -Infinity;
    let swingLow = Infinity;
    for (let j = fibLookback; j <= i; j++) {
      if (candles[j].high > swingHigh) swingHigh = candles[j].high;
      if (candles[j].low < swingLow) swingLow = candles[j].low;
    }
    const rawFibs = calculateFibonacciRetracement(swingHigh, swingLow);
    const fibLevels = rawFibs.map(f => ({
      ratio: f.level,
      price: f.price,
      distancePct: Number((((c.close - f.price) / f.price) * 100).toFixed(2)),
    }));

    // VPVR over prior 60 bars in [0..i]
    const vpvrSlice = candles.slice(fibLookback, i + 1);
    const vpvrRaw = calculateVPVR(vpvrSlice, 20);
    const vpvr = vpvrRaw
      ? {
          poc: vpvrRaw.poc,
          val: vpvrRaw.val,
          vah: vpvrRaw.vah,
          distPocPct: Number((((c.close - vpvrRaw.poc) / vpvrRaw.poc) * 100).toFixed(2)),
        }
      : null;

    // Volume ratio
    const avgVol = volSma20[i];
    const volumeRatio20 = Number.isFinite(avgVol) && avgVol > 0 ? Number((c.volume / avgVol).toFixed(2)) : 1.0;

    timeline.push({
      date: c.date,
      close: c.close,
      high: c.high,
      low: c.low,
      volume: c.volume,
      mas,
      maDistancesPct,
      maSlopes,
      consecutiveBarsBelow,
      kdj: { k: currentK, d: currentD, j: currentJ },
      kdjCross,
      rsi: rsi[i] ?? 50,
      macd: { dif: curDif, dea: curDea, hist: curHist },
      macdCross,
      macdDivergence,
      candlestickPatterns: patternsList[i] ?? new Set(),
      fibLevels,
      vpvr,
      volumeRatio20,
    });
  }

  return timeline;
}
