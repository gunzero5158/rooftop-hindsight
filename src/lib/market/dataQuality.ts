import { Candle } from "../shared-types/interop";

/**
 * Validates, deduplicates, and protects K-line series against QFQ dividend distortions.
 */
export function sanitizeAndProtectCandles(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];

  // 1. Sort chronologically and deduplicate by date
  const sorted = [...candles].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const deduped: Candle[] = [];
  for (const c of sorted) {
    if (deduped.length === 0 || deduped[deduped.length - 1].date !== c.date) {
      deduped.push({ ...c });
    } else {
      // Overwrite with latest valid bar
      deduped[deduped.length - 1] = { ...c };
    }
  }

  // 2. QFQ Distortion Protection
  // If price subtraction caused prices to become <= 0 or unnaturally tiny (< 0.05),
  // apply ratio normalization to prevent division-by-zero or wild percentage inflation.
  let hasPriceDistortion = false;
  for (const c of deduped) {
    if (c.close <= 0.05 || c.low <= 0.01 || c.open <= 0.05 || c.high <= 0.05) {
      hasPriceDistortion = true;
      break;
    }
  }

  if (hasPriceDistortion) {
    // Re-anchor: find the minimum price and shift/ratio adjust so lowest price is safe
    let minPrice = Infinity;
    for (const c of deduped) {
      minPrice = Math.min(minPrice, c.low, c.open, c.close);
    }
    const offset = minPrice <= 0 ? Math.abs(minPrice) + 1.0 : 0;
    if (offset > 0) {
      for (const c of deduped) {
        c.open = Number((c.open + offset).toFixed(4));
        c.high = Number((c.high + offset).toFixed(4));
        c.low = Number((c.low + offset).toFixed(4));
        c.close = Number((c.close + offset).toFixed(4));
      }
    }
  }

  return deduped;
}
