import { Candle } from "../shared-types/interop";

/**
 * Generates synthetic realistic candles for testing and offline fallback.
 */
export function generateSyntheticCandles(
  count: number = 600,
  initialPrice: number = 100,
  seed: number = 42
): Candle[] {
  const candles: Candle[] = [];
  let currentPrice = initialPrice;
  let date = new Date(Date.now() - count * 24 * 3600 * 1000);

  // Simple deterministic PRNG
  let s = seed;
  function rand() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  }

  for (let i = 0; i < count; i++) {
    date = new Date(date.getTime() + 24 * 3600 * 1000);
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) {
      continue;
    }

    const changePct = (rand() - 0.49) * 0.04; // -2% ~ +2%
    const open = currentPrice;
    const close = Number((open * (1 + changePct)).toFixed(2));
    const high = Number((Math.max(open, close) + rand() * 0.015 * open).toFixed(2));
    const low = Number((Math.min(open, close) - rand() * 0.015 * open).toFixed(2));
    const volume = Math.floor(10000 + rand() * 50000);

    candles.push({
      date: date.toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume,
    });

    currentPrice = close;
  }

  return candles;
}
