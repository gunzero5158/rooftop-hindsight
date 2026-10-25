import { Candle } from "../shared-types/interop";

export async function fetchYahooChartCandles(
  symbol: string,
  rangeYears: number,
  timeframe: "daily" | "weekly"
): Promise<Candle[]> {
  const range = rangeYears >= 5 ? "5y" : rangeYears >= 3 ? "3y" : rangeYears >= 2 ? "2y" : "1y";
  const interval = timeframe === "weekly" ? "1wk" : "1d";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=${range}&interval=${interval}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    throw new Error(`Yahoo chart request failed for ${symbol}: ${res.status}`);
  }

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    throw new Error(`No chart data returned for ${symbol}`);
  }

  const timestamps: number[] = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const candles: Candle[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    const v = quote.volume?.[i];

    if (
      typeof o === "number" &&
      typeof h === "number" &&
      typeof l === "number" &&
      typeof c === "number" &&
      Number.isFinite(c)
    ) {
      const d = new Date(timestamps[i] * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      candles.push({
        date: dateStr,
        open: Number(o.toFixed(4)),
        high: Number(h.toFixed(4)),
        low: Number(l.toFixed(4)),
        close: Number(c.toFixed(4)),
        volume: Number(v) || 0,
      });
    }
  }

  return candles;
}
