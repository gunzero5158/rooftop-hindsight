import { NextRequest, NextResponse } from "next/server";
import { fetchHistoricalCandles } from "@/lib/market/marketService";
import { runHindsightPipeline } from "@/lib/hindsight/aiPipeline";
import { detectMarket } from "@/lib/market/symbolConversion";
import { MarketCode, TimeframeCode } from "@/lib/shared-types/interop";

const MARKETS: MarketCode[] = ["CN", "HK", "US", "JP"];
const WARMUP_BARS = 250;

function clampNumber(raw: string | null, fallback: number, min: number, max: number): number {
  const v = raw === null ? NaN : parseFloat(raw);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "600519").trim();
    const rawMarket = searchParams.get("market") as MarketCode | null;
    const market: MarketCode = rawMarket && MARKETS.includes(rawMarket) ? rawMarket : detectMarket(symbol);
    const timeframe: TimeframeCode = searchParams.get("timeframe") === "weekly" ? "weekly" : "daily";
    const minSwingPct = clampNumber(searchParams.get("minSwingPct"), 0.10, 0.03, 0.5);
    const years = clampNumber(searchParams.get("years"), 3, 1, 5);
    // Weekly warmup in weeks keeps the same ~1 year of indicator stabilization
    const warmupBars = timeframe === "weekly" ? 52 : WARMUP_BARS;

    // 1. Fetch candles (lookback + indicator warmup)
    const { candles, isMock, symbol: normalizedSymbol } = await fetchHistoricalCandles(symbol, {
      years,
      timeframe,
      warmupBars,
      allowMockFallback: true,
    });

    if (candles.length < 60) {
      return NextResponse.json(
        { error: `Insufficient candle data for symbol: ${symbol}` },
        { status: 400 }
      );
    }

    // 2. Run core hindsight pipeline
    const pipelineResult = await runHindsightPipeline(candles, {
      symbol: normalizedSymbol,
      market,
      timeframe,
      minSwingPct,
      warmupBars,
      horizonBars: timeframe === "weekly" ? 15 : 40,
    });

    return NextResponse.json({
      success: true,
      ...pipelineResult,
      isMock,
      // Full series: triggeredIndices / swing indices are positions in this array
      candles,
    });
  } catch (err: unknown) {
    console.error("API /api/hindsight error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
