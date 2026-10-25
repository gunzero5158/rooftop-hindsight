export interface FibRetracement {
  level: number; // 0.382, 0.5, 0.618, 0.786
  price: number;
}

/**
 * Calculates Fibonacci retracement levels for a given swing high and swing low.
 * For a pullback in an uptrend (from low up to high, then pulling back down):
 * price = high - ratio * (high - low)
 */
export function calculateFibonacciRetracement(swingHigh: number, swingLow: number): FibRetracement[] {
  const range = swingHigh - swingLow;
  if (range <= 0) return [];

  const ratios = [0.236, 0.382, 0.5, 0.618, 0.786];
  return ratios.map(r => ({
    level: r,
    price: Number((swingHigh - r * range).toFixed(4)),
  }));
}
