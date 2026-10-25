import { Candle, TimeframeCode } from "../shared-types/interop";
import { convertSymbolToEastMoneySecid, detectMarket, normalizeSymbol } from "./symbolConversion";
import { fetchEastMoneyKlines } from "./eastmoneyHttp";
import { fetchYahooChartCandles } from "./yahooChart";
import { sanitizeAndProtectCandles } from "./dataQuality";
import { generateSyntheticCandles } from "./mockMarketData";

export interface FetchOptions {
  years?: number; // 1, 2, 3, 5
  timeframe?: TimeframeCode; // daily, weekly
  warmupBars?: number; // default 250
  allowMockFallback?: boolean;
}

const memoryCache = new Map<string, { timestamp: number; candles: Candle[] }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

export async function fetchHistoricalCandles(
  rawSymbol: string,
  options: FetchOptions = {}
): Promise<{ candles: Candle[]; isMock: boolean; symbol: string }> {
  const symbol = normalizeSymbol(rawSymbol);
  const years = options.years ?? 2;
  const timeframe = options.timeframe ?? "daily";
  const warmupBars = options.warmupBars ?? 250;

  // Approx bars: daily ~ 250 bars/yr, weekly ~ 52 bars/yr
  const baseBars = timeframe === "weekly" ? years * 52 : years * 250;
  const totalLimit = baseBars + warmupBars;

  const cacheKey = `${symbol}_${timeframe}_${years}_${warmupBars}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { candles: cached.candles, isMock: false, symbol };
  }

  const market = detectMarket(symbol);
  let candles: Candle[] = [];

  // 1. Try EastMoney first for CN/HK, or if secid is available
  const secid = convertSymbolToEastMoneySecid(symbol);
  if (secid && (market === "CN" || market === "HK")) {
    try {
      candles = await fetchEastMoneyKlines(secid, timeframe, totalLimit);
    } catch {
      // Fall through to Yahoo
    }
  }

  // 2. Try Yahoo Chart if EastMoney failed or for US/JP
  if (candles.length < 20) {
    try {
      const yahooSymbol =
        symbol.endsWith(".SS") ? symbol.replace(".SS", ".SS") :
        symbol.endsWith(".SZ") ? symbol.replace(".SZ", ".SZ") :
        symbol;
      candles = await fetchYahooChartCandles(yahooSymbol, years + 1, timeframe);
    } catch {
      // Fall through to mock if permitted
    }
  }

  // 3. Mock fallback if allowed or when testing
  let isMock = false;
  if (candles.length < 20) {
    if (options.allowMockFallback || process.env.NODE_ENV === "test") {
      candles = generateSyntheticCandles(totalLimit, 100);
      isMock = true;
    } else {
      throw new Error(`Unable to fetch market candles for ${symbol}`);
    }
  }

  const sanitized = sanitizeAndProtectCandles(candles);
  if (!isMock) {
    memoryCache.set(cacheKey, { timestamp: Date.now(), candles: sanitized });
  }

  return { candles: sanitized, isMock, symbol };
}
