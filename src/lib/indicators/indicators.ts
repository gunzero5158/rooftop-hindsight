import { Candle } from "../shared-types/interop";

/**
 * Calculates Simple Moving Average (SMA)
 */
export function calculateSMA(candles: Candle[], period: number): number[] {
  const sma: number[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) {
      sum -= candles[i - period].close;
    }
    if (i < period - 1) {
      sma.push(NaN);
    } else {
      sma.push(Number((sum / period).toFixed(4)));
    }
  }
  return sma;
}

/**
 * Calculates Exponential Moving Average (EMA)
 */
export function calculateEMA(candles: Candle[], period: number): number[] {
  const ema: number[] = [];
  if (candles.length === 0) return ema;

  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < Math.min(period, candles.length); i++) {
    sum += candles[i].close;
  }
  let currentEma = sum / Math.min(period, candles.length);

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      ema.push(NaN);
    } else if (i === period - 1) {
      ema.push(Number(currentEma.toFixed(4)));
    } else {
      currentEma = candles[i].close * k + currentEma * (1 - k);
      ema.push(Number(currentEma.toFixed(4)));
    }
  }
  return ema;
}

/**
 * Calculates Bollinger Bands (BOLL)
 */
export function calculateBOLL(
  candles: Candle[],
  period: number = 20,
  multiplier: number = 2
): { middle: number[]; upper: number[]; lower: number[] } {
  const middle: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      middle.push(NaN);
      upper.push(NaN);
      lower.push(NaN);
      continue;
    }

    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close;
    }
    const sma = sum / period;
    middle.push(Number(sma.toFixed(4)));

    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      varianceSum += Math.pow(candles[j].close - sma, 2);
    }
    const stdDev = Math.sqrt(varianceSum / period);

    upper.push(Number((sma + multiplier * stdDev).toFixed(4)));
    lower.push(Number((sma - multiplier * stdDev).toFixed(4)));
  }

  return { middle, upper, lower };
}

/**
 * Calculates Moving Average Convergence Divergence (MACD)
 */
export function calculateMACD(
  candles: Candle[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { dif: number[]; dea: number[]; hist: number[] } {
  const dif: number[] = [];
  const dea: number[] = [];
  const hist: number[] = [];

  if (candles.length === 0) return { dif, dea, hist };

  const emaFast = calculateEMA(candles, fastPeriod);
  const emaSlow = calculateEMA(candles, slowPeriod);

  for (let i = 0; i < candles.length; i++) {
    if (isNaN(emaFast[i]) || isNaN(emaSlow[i])) {
      dif.push(NaN);
    } else {
      dif.push(Number((emaFast[i] - emaSlow[i]).toFixed(4)));
    }
  }

  const firstValidDifIndex = dif.findIndex(v => !isNaN(v));
  if (firstValidDifIndex === -1) {
    return { dif, dea: dif.map(() => NaN), hist: dif.map(() => NaN) };
  }

  const k = 2 / (signalPeriod + 1);
  let currentDea = 0;
  
  let sum = 0;
  let count = 0;
  for (let i = firstValidDifIndex; i < Math.min(firstValidDifIndex + signalPeriod, dif.length); i++) {
    sum += dif[i];
    count++;
  }
  currentDea = sum / count;

  for (let i = 0; i < candles.length; i++) {
    if (i < firstValidDifIndex + signalPeriod - 1) {
      dea.push(NaN);
      hist.push(NaN);
    } else if (i === firstValidDifIndex + signalPeriod - 1) {
      dea.push(Number(currentDea.toFixed(4)));
      hist.push(Number(((dif[i] - currentDea) * 2).toFixed(4)));
    } else {
      currentDea = dif[i] * k + currentDea * (1 - k);
      dea.push(Number(currentDea.toFixed(4)));
      hist.push(Number(((dif[i] - currentDea) * 2).toFixed(4)));
    }
  }

  return { dif, dea, hist };
}

/**
 * Calculates KDJ indicator (Chinese standard: 9, 3, 3)
 */
export function calculateKDJ(
  candles: Candle[],
  n: number = 9,
  m1: number = 3,
  m2: number = 3
): { k: number[]; d: number[]; j: number[] } {
  const kArr: number[] = [];
  const dArr: number[] = [];
  const jArr: number[] = [];

  let lastK = 50;
  let lastD = 50;

  for (let i = 0; i < candles.length; i++) {
    if (i < n - 1) {
      kArr.push(NaN);
      dArr.push(NaN);
      jArr.push(NaN);
      continue;
    }

    let hn = -Infinity;
    let ln = Infinity;
    for (let j = i - n + 1; j <= i; j++) {
      if (candles[j].high > hn) hn = candles[j].high;
      if (candles[j].low < ln) ln = candles[j].low;
    }

    const cn = candles[i].close;
    let rsv = 0;
    if (hn !== ln) {
      rsv = ((cn - ln) / (hn - ln)) * 100;
    } else {
      rsv = 50;
    }

    const k = (1 / m1) * rsv + ((m1 - 1) / m1) * lastK;
    const d = (1 / m2) * k + ((m2 - 1) / m2) * lastD;
    const j = 3 * k - 2 * d;

    kArr.push(Number(k.toFixed(4)));
    dArr.push(Number(d.toFixed(4)));
    jArr.push(Number(j.toFixed(4)));

    lastK = k;
    lastD = d;
  }

  return { k: kArr, d: dArr, j: jArr };
}

/**
 * Calculates Relative Strength Index (RSI)
 */
export function calculateRSI(candles: Candle[], period: number = 14): number[] {
  const rsi: number[] = [];
  if (candles.length < 2) return candles.map(() => NaN);

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < Math.min(period, gains.length); i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      rsi.push(NaN);
    } else if (i === period) {
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(Number((100 - 100 / (1 + rs)).toFixed(4)));
    } else {
      const idx = i - 1;
      avgGain = (avgGain * (period - 1) + gains[idx]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[idx]) / period;

      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(Number((100 - 100 / (1 + rs)).toFixed(4)));
    }
  }

  return rsi;
}

/**
 * Calculates Average True Range (ATR)
 */
export function calculateATR(candles: Candle[], period: number = 14): number[] {
  const atr: number[] = [];
  if (candles.length === 0) return atr;

  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hpc = Math.abs(candles[i].high - candles[i - 1].close);
    const lpc = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(hl, hpc, lpc));
  }

  let currentAtr = 0;
  for (let i = 0; i < Math.min(period, tr.length); i++) {
    currentAtr += tr[i];
  }
  currentAtr /= period;

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      atr.push(NaN);
    } else if (i === period - 1) {
      atr.push(Number(currentAtr.toFixed(4)));
    } else {
      currentAtr = (currentAtr * (period - 1) + tr[i]) / period;
      atr.push(Number(currentAtr.toFixed(4)));
    }
  }

  return atr;
}

/**
 * Calculates Volume Profile (VPVR) within a lookback window
 */
export interface VpvrResult {
  poc: number; // Point of Control (highest volume price)
  val: number; // Value Area Low
  vah: number; // Value Area High
}

export function calculateVPVR(candles: Candle[], numBins: number = 30): VpvrResult | null {
  if (candles.length === 0) return null;

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let totalVolume = 0;

  for (const c of candles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
    totalVolume += c.volume;
  }

  if (minPrice === maxPrice || totalVolume === 0) {
    return { poc: minPrice, val: minPrice, vah: maxPrice };
  }

  const binSize = (maxPrice - minPrice) / numBins;
  const bins = new Float64Array(numBins);

  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const binIdx = Math.min(
      numBins - 1,
      Math.max(0, Math.floor((typicalPrice - minPrice) / binSize))
    );
    bins[binIdx] += c.volume;
  }

  let maxVol = -1;
  let pocIdx = 0;
  for (let i = 0; i < numBins; i++) {
    if (bins[i] > maxVol) {
      maxVol = bins[i];
      pocIdx = i;
    }
  }

  const poc = Number((minPrice + (pocIdx + 0.5) * binSize).toFixed(4));

  // Value Area (70% of total volume)
  const targetVaVol = totalVolume * 0.7;
  let currentVaVol = bins[pocIdx];
  let left = pocIdx;
  let right = pocIdx;

  while (currentVaVol < targetVaVol && (left > 0 || right < numBins - 1)) {
    const leftVol = left > 0 ? bins[left - 1] : -1;
    const rightVol = right < numBins - 1 ? bins[right + 1] : -1;

    if (leftVol >= rightVol && left > 0) {
      left--;
      currentVaVol += bins[left];
    } else if (right < numBins - 1) {
      right++;
      currentVaVol += bins[right];
    } else if (left > 0) {
      left--;
      currentVaVol += bins[left];
    } else {
      break;
    }
  }

  const val = Number((minPrice + left * binSize).toFixed(4));
  const vah = Number((minPrice + (right + 1) * binSize).toFixed(4));

  return { poc, val, vah };
}
