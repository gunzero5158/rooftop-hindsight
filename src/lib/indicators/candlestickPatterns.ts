import { Candle } from "../shared-types/interop";

export type CandlestickPatternType =
  | "hammer"
  | "long_lower_shadow"
  | "long_upper_shadow"
  | "shooting_star"
  | "bullish_engulfing"
  | "bearish_engulfing"
  | "morning_star"
  | "evening_star"
  | "doji";

/**
 * Detect candlestick patterns for each bar in the series
 */
export function detectCandlestickPatterns(candles: Candle[]): Set<CandlestickPatternType>[] {
  const result: Set<CandlestickPatternType>[] = [];

  for (let i = 0; i < candles.length; i++) {
    const patterns = new Set<CandlestickPatternType>();
    const c = candles[i];
    const range = Math.max(c.high - c.low, 0.0001);
    const body = Math.abs(c.close - c.open);
    const upperShadow = c.high - Math.max(c.open, c.close);
    const lowerShadow = Math.min(c.open, c.close) - c.low;

    // Doji
    if (body / range <= 0.1) {
      patterns.add("doji");
    }

    // Long lower shadow (>= 60% of total range)
    if (lowerShadow / range >= 0.6) {
      patterns.add("long_lower_shadow");
    }

    // Long upper shadow (>= 60% of total range)
    if (upperShadow / range >= 0.6) {
      patterns.add("long_upper_shadow");
    }

    // Hammer: lower shadow >= 2x body, upper shadow <= 0.2x range
    if (lowerShadow >= 2 * body && upperShadow <= 0.2 * range && lowerShadow / range >= 0.5) {
      patterns.add("hammer");
    }

    // Shooting Star: upper shadow >= 2x body, lower shadow <= 0.2x range
    if (upperShadow >= 2 * body && lowerShadow <= 0.2 * range && upperShadow / range >= 0.5) {
      patterns.add("shooting_star");
    }

    // Multi-bar patterns
    if (i >= 1) {
      const prev = candles[i - 1];
      const prevBody = Math.abs(prev.close - prev.open);
      const isPrevRed = prev.close < prev.open;
      const isCurrentGreen = c.close > c.open;
      const isPrevGreen = prev.close > prev.open;
      const isCurrentRed = c.close < c.open;

      // Bullish Engulfing: prev is red, current is green and engulfs prev body
      if (
        isPrevRed &&
        isCurrentGreen &&
        c.open <= prev.close &&
        c.close >= prev.open &&
        body > prevBody
      ) {
        patterns.add("bullish_engulfing");
      }

      // Bearish Engulfing: prev is green, current is red and engulfs prev body
      if (
        isPrevGreen &&
        isCurrentRed &&
        c.open >= prev.close &&
        c.close <= prev.open &&
        body > prevBody
      ) {
        patterns.add("bearish_engulfing");
      }
    }

    // 3-bar patterns: Morning Star & Evening Star
    if (i >= 2) {
      const first = candles[i - 2];
      const second = candles[i - 1];
      const third = c;

      const firstBody = Math.abs(first.close - first.open);
      const secondBody = Math.abs(second.close - second.open);
      const thirdBody = Math.abs(third.close - third.open);

      // Morning Star: first is red, second is small star, third is green closing > midpoint of first
      if (
        first.close < first.open &&
        secondBody < firstBody * 0.5 &&
        third.close > third.open &&
        third.close > (first.open + first.close) / 2
      ) {
        patterns.add("morning_star");
      }

      // Evening Star: first is green, second is small star, third is red closing < midpoint of first
      if (
        first.close > first.open &&
        secondBody < firstBody * 0.5 &&
        third.close < third.open &&
        third.close < (first.open + first.close) / 2
      ) {
        patterns.add("evening_star");
      }
    }

    result.push(patterns);
  }

  return result;
}
