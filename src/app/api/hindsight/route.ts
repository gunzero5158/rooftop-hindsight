import { NextRequest, NextResponse } from "next/server";
import { fetchHistoricalCandles } from "@/lib/market/marketService";
import { runHindsightPipeline } from "@/lib/hindsight/aiPipeline";
import { extractSwings } from "@/lib/hindsight/swingExtractor";
import { detectMarket } from "@/lib/market/symbolConversion";
import { TimeframeCode } from "@/lib/shared-types/interop";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") || "600519";
    const market = (searchParams.get("market") as any) || detectMarket(symbol);
    const timeframe = (searchParams.get("timeframe") as TimeframeCode) || "daily";
    const minSwingPct = parseFloat(searchParams.get("minSwingPct") || "0.10");
    const years = parseFloat(searchParams.get("years") || "3");

    // 1. Fetch candles
    const { candles, isMock } = await fetchHistoricalCandles(symbol, {
      years,
      timeframe,
      warmupBars: 250,
      allowMockFallback: true,
    });

    if (candles.length < 30) {
      return NextResponse.json(
        { error: `Insufficient candle data for symbol: ${symbol}` },
        { status: 400 }
      );
    }

    // 2. Run core hindsight pipeline
    const pipelineResult = await runHindsightPipeline(candles, {
      symbol,
      market,
      minSwingPct,
      horizonBars: timeframe === "weekly" ? 15 : 40,
    });

    // 3. Extract swings for chart annotation
    const swings = extractSwings(candles, { minSwingPct });

    return NextResponse.json({
      success: true,
      ...pipelineResult,
      isMock,
      swings,
      // Pass the recent candles for chart rendering (keep payload light)
      candles: candles.slice(-500),
    });
  } catch (err: any) {
    console.error("API /api/hindsight error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
