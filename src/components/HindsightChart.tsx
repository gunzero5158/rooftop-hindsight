"use client";

import React, { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  ColorType,
  IChartApi,
  ISeriesApi,
  SeriesMarker,
  Time,
} from "lightweight-charts";
import { Candle } from "@/lib/shared-types/interop";
import { SwingSegment, EvaluationResult } from "@/lib/hindsight/types";
import { calculateEMA } from "@/lib/indicators/indicators";

interface ChartProps {
  candles: Candle[];
  swings?: SwingSegment[];
  selectedRuleResult?: EvaluationResult | null;
}

export default function HindsightChart({
  candles,
  swings = [],
  selectedRuleResult,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    // Clean up previous instance
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 480,
      layout: {
        background: { type: ColorType.Solid, color: "#090d16" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "rgba(30, 41, 59, 0.5)" },
        horzLines: { color: "rgba(30, 41, 59, 0.5)" },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: "#334155",
      },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
      },
    });

    chartInstanceRef.current = chart;

    // 1. Candlestick series (Chinese standard: red up, green down)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#ef4444",
      downColor: "#22c55e",
      borderUpColor: "#ef4444",
      borderDownColor: "#22c55e",
      wickUpColor: "#ef4444",
      wickDownColor: "#22c55e",
    });

    const candleData = candles.map(c => ({
      time: c.date as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(candleData);

    // 2. EMA20 Line
    const ema20Values = calculateEMA(candles, 20);
    const ema20Series = chart.addSeries(LineSeries, {
      color: "#eab308", // Yellow
      lineWidth: 1,
      title: "EMA20",
    });
    const ema20Data = candles
      .map((c, i) => ({ time: c.date as Time, value: ema20Values[i] }))
      .filter(d => Number.isFinite(d.value));
    ema20Series.setData(ema20Data);

    // 3. EMA60 Line
    const ema60Values = calculateEMA(candles, 60);
    const ema60Series = chart.addSeries(LineSeries, {
      color: "#38bdf8", // Sky blue
      lineWidth: 2,
      title: "EMA60",
    });
    const ema60Data = candles
      .map((c, i) => ({ time: c.date as Time, value: ema60Values[i] }))
      .filter(d => Number.isFinite(d.value));
    ema60Series.setData(ema60Data);

    // 4. Markers
    const markers: SeriesMarker<Time>[] = [];

    // Historical swings: mark trough start points
    for (const s of swings) {
      if (s.startDate) {
        markers.push({
          time: s.startDate as Time,
          position: "belowBar",
          color: "#10b981",
          shape: "arrowUp",
          text: `+${(s.gainPct * 100).toFixed(0)}%`,
        });
      }
    }

    // Selected rule historical trigger points
    if (selectedRuleResult) {
      const winningSet = new Set(selectedRuleResult.winningIndices);
      for (const idx of selectedRuleResult.triggeredIndices) {
        const c = candles[idx];
        if (c) {
          const isWin = winningSet.has(idx);
          markers.push({
            time: c.date as Time,
            position: "aboveBar",
            color: isWin ? "#f59e0b" : "#64748b",
            shape: "circle",
            text: isWin ? "触发-达标" : "触发-未达标",
          });
        }
      }
    }

    if (markers.length > 0) {
      // Sort markers by time ascending as required by lightweight-charts
      markers.sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0));
      createSeriesMarkers(candleSeries, markers);
    }

    chart.timeScale().fitContent();

    // Resize observer
    const handleResize = () => {
      if (containerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [candles, swings, selectedRuleResult]);

  return (
    <div className="relative w-full rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3 text-sm">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-200">K线与拐点图表</span>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400"></span>
              <span className="text-slate-400">EMA20</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-400"></span>
              <span className="text-slate-400">EMA60 (关键支撑线)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold">↑</span>
              <span className="text-slate-400">历史波段启动点 (&ge;10%)</span>
            </span>
          </div>
        </div>
        {selectedRuleResult && (
          <div className="flex items-center gap-2 rounded-lg bg-indigo-950/60 px-3 py-1 border border-indigo-700/50 text-xs text-indigo-300">
            <span>当前高亮规律:</span>
            <span className="font-medium text-amber-300">{selectedRuleResult.hypothesis.title}</span>
            <span className="text-slate-400">
              (触发 {selectedRuleResult.triggerCount} 次, 胜率 {(selectedRuleResult.winRate * 100).toFixed(1)}%)
            </span>
          </div>
        )}
      </div>
      <div ref={containerRef} className="w-full h-[480px]" />
    </div>
  );
}
