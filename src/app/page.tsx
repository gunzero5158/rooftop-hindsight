"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  TrendingUp,
  Search,
  Sliders,
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
  BarChart3,
  Flame,
  ArrowUpRight,
  Layers,
  Sparkles,
  Info,
  ChevronRight,
} from "lucide-react";
import {
  Candle,
  HindsightKeyLevel,
  HindsightSummaryPayload,
  MarketCode,
  TimeframeCode,
  buildTradeDisciplineUrl,
  keyLevelToCrossToolParams,
} from "@/lib/shared-types/interop";
import { SwingSegment, EvaluationResult } from "@/lib/hindsight/types";

// Dynamic import for Lightweight Charts (no SSR)
const HindsightChart = dynamic(() => import("@/components/HindsightChart"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[480px] w-full items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-slate-500">
      正在加载图表引擎...
    </div>
  ),
});

const PRESET_SYMBOLS = [
  { label: "贵州茅台", symbol: "600519", market: "CN" as MarketCode },
  { label: "宁德时代", symbol: "300750", market: "CN" as MarketCode },
  { label: "腾讯控股", symbol: "00700", market: "HK" as MarketCode },
  { label: "苹果公司", symbol: "AAPL", market: "US" as MarketCode },
  { label: "丰田汽车", symbol: "7203.T", market: "JP" as MarketCode },
];

export default function HindsightDashboard() {
  const [symbol, setSymbol] = useState("600519");
  const [market, setMarket] = useState<MarketCode>("CN");
  const [timeframe, setTimeframe] = useState<TimeframeCode>("daily");
  const [minSwingPct, setMinSwingPct] = useState(0.10);
  const [lookbackYears, setLookbackYears] = useState(3);
  const [loading, setLoading] = useState(false);

  // Analysis result states
  const [payload, setPayload] = useState<HindsightSummaryPayload | null>(null);
  const [swings, setSwings] = useState<SwingSegment[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [hypothesesResults, setHypothesesResults] = useState<EvaluationResult[]>([]);
  const [selectedRule, setSelectedRule] = useState<EvaluationResult | null>(null);
  const [activeTab, setActiveTab] = useState<"rules" | "swings">("rules");
  const [disciplineUrlModal, setDisciplineUrlModal] = useState<string | null>(null);

  // Initial fetch
  useEffect(() => {
    fetchAnalysis();
  }, []);

  const fetchAnalysis = async (customSymbol?: string, customMarket?: MarketCode) => {
    const targetSymbol = customSymbol || symbol;
    const targetMarket = customMarket || market;
    setLoading(true);

    try {
      const url = `/api/hindsight?symbol=${encodeURIComponent(targetSymbol)}&market=${targetMarket}&timeframe=${timeframe}&minSwingPct=${minSwingPct}&years=${lookbackYears}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setPayload(data);
        setSwings(data.swings || []);
        setCandles(data.candles || []);
        const sortedRules = (data.hypothesesResults || []).sort(
          (a: EvaluationResult, b: EvaluationResult) => b.winRate - a.winRate
        );
        setHypothesesResults(sortedRules);
        if (sortedRules.length > 0) {
          setSelectedRule(sortedRules[0]);
        }
      }
    } catch (err) {
      console.error("Failed to run hindsight analysis:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPreset = (item: (typeof PRESET_SYMBOLS)[0]) => {
    setSymbol(item.symbol);
    setMarket(item.market);
    fetchAnalysis(item.symbol, item.market);
  };

  const handleOpenDiscipline = (level: HindsightKeyLevel) => {
    if (!payload) return;
    const crossParams = keyLevelToCrossToolParams(level, payload.symbol, payload.currentPrice);
    const url = buildTradeDisciplineUrl(crossParams, "https://discipline.internal/calculator");
    setDisciplineUrlModal(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-rose-500 shadow-lg shadow-indigo-500/20">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">天台马后炮</h1>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                  v0.3.0
                </span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                  拐点共性挖掘
                </span>
              </div>
              <p className="text-xs text-slate-400">基于股票历史上涨区间的启动共性指标挖掘买点与点位胜率</p>
            </div>
          </div>

          {/* Quick presets */}
          <div className="hidden md:flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 text-[11px] mr-1">快捷标的:</span>
            {PRESET_SYMBOLS.map(p => (
              <button
                key={p.symbol}
                onClick={() => handleSelectPreset(p)}
                className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                  symbol === p.symbol
                    ? "bg-indigo-600 text-white font-medium shadow-sm"
                    : "bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div className="border-t border-slate-800/60 bg-slate-900/40 px-4 py-2.5 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* Symbol input */}
              <div className="relative flex items-center">
                <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={symbol}
                  onChange={e => setSymbol(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && fetchAnalysis()}
                  placeholder="输入代码 如 600519"
                  className="w-36 rounded-lg border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Market selector */}
              <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
                {(["CN", "HK", "US", "JP"] as MarketCode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setMarket(m)}
                    className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                      market === m ? "bg-slate-800 font-medium text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {m === "CN" ? "A股" : m === "HK" ? "港股" : m === "US" ? "美股" : "日股"}
                  </button>
                ))}
              </div>

              {/* Timeframe */}
              <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
                {(["daily", "weekly"] as TimeframeCode[]).map(tf => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                      timeframe === tf ? "bg-slate-800 font-medium text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {tf === "daily" ? "日线" : "周线"}
                  </button>
                ))}
              </div>

              {/* Min swing threshold */}
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1">
                <span className="text-slate-400">启动涨幅:</span>
                <select
                  value={minSwingPct}
                  onChange={e => setMinSwingPct(parseFloat(e.target.value))}
                  className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value={0.08} className="bg-slate-900">&ge; 8%</option>
                  <option value={0.10} className="bg-slate-900">&ge; 10% (推荐)</option>
                  <option value={0.15} className="bg-slate-900">&ge; 15%</option>
                  <option value={0.20} className="bg-slate-900">&ge; 20%</option>
                </select>
              </div>

              {/* Lookback years */}
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1">
                <span className="text-slate-400">回溯年限:</span>
                <select
                  value={lookbackYears}
                  onChange={e => setLookbackYears(parseFloat(e.target.value))}
                  className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value={1} className="bg-slate-900">近 1 年</option>
                  <option value={2} className="bg-slate-900">近 2 年</option>
                  <option value={3} className="bg-slate-900">近 3 年 (推荐)</option>
                  <option value={5} className="bg-slate-900">近 5 年</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => fetchAnalysis()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-1.5 font-medium text-white shadow-md shadow-indigo-600/30 hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{loading ? "挖掘中..." : "一键马后炮挖掘"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Top Info Cards */}
        {payload && (
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* 1. Current Price & Signal Status */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>标的当前行情</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                  {payload.market} · {payload.timeframe === "daily" ? "日K" : "周K"}
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-3xl font-extrabold tracking-tight text-white">
                  {payload.currentPrice.toFixed(2)}
                </span>
                <span className="text-sm font-semibold text-slate-300">
                  {payload.symbol}
                </span>
              </div>

              <div className="mt-4 border-t border-slate-800/80 pt-3">
                <div className="text-xs text-slate-400 mb-1.5">启动信号诊断:</div>
                {payload.activeSignals.length > 0 ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-2.5 text-xs text-emerald-300">
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>已命中历史高胜率启动规律!</span>
                    </div>
                    <div className="mt-1 text-[11px] text-emerald-200/90">
                      {payload.activeSignals[0].title} (历史胜率: {(payload.activeSignals[0].winRate * 100).toFixed(1)}%)
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                      <Info className="h-4 w-4 text-slate-400" />
                      <span>当前未触发极端低位启动信号</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      处于正常波动区间，建议等待关键均线支撑防守确认。
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Wave Summary */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>历史波段共性统计</span>
                <span className="text-[11px] text-indigo-400">回溯 {payload.lookbackYears} 年</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800">
                  <div className="text-[11px] text-slate-400">有效上涨波段</div>
                  <div className="mt-1 text-xl font-bold text-slate-100">{swings.length} 个</div>
                  <div className="text-[10px] text-slate-400">启动涨幅 &ge; {(minSwingPct * 100).toFixed(0)}%</div>
                </div>
                <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800">
                  <div className="text-[11px] text-slate-400">波段平均涨幅</div>
                  <div className="mt-1 text-xl font-bold text-emerald-400">
                    {swings.length > 0
                      ? `+${((swings.reduce((a, s) => a + s.gainPct, 0) / swings.length) * 100).toFixed(1)}%`
                      : "0%"}
                  </div>
                  <div className="text-[10px] text-slate-400">中位持续 {swings.length > 0 ? swings[Math.floor(swings.length / 2)].durationBars : 0} 根K线</div>
                </div>
              </div>
              <div className="mt-3 text-[11px] text-slate-400">
                从区域低点启动后，若能守住关键均线，波段平均期望涨幅显著。
              </div>
            </div>

            {/* 3. Trade Discipline Link Card */}
            <div className="rounded-xl border border-indigo-900/50 bg-indigo-950/20 p-4 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between text-xs text-indigo-300">
                <span className="flex items-center gap-1.5 font-semibold">
                  <ShieldAlert className="h-4 w-4 text-indigo-400" />
                  <span>交易纪律对齐与联动</span>
                </span>
                <span className="rounded bg-indigo-900/60 px-1.5 py-0.5 text-[10px] text-indigo-300 border border-indigo-700/40">
                  trade-discipline
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-300">
                本工具负责挖掘历史启动共性与点位胜率，止损与软线容差已按历史 80 分位下影刺穿深度严格测算。
              </p>
              <div className="mt-3 space-y-1.5">
                {payload.keyLevels.slice(0, 2).map((lvl, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-slate-950/80 px-2.5 py-1.5 text-xs border border-slate-800"
                  >
                    <div>
                      <span className="font-semibold text-slate-200">{lvl.sourceRuleTitle}</span>
                      <div className="text-[10px] text-slate-400">
                        点位 {lvl.price.toFixed(2)} · 建议防守止损 {lvl.suggestedStop?.toFixed(2)} (容差 {lvl.bufferPct}%)
                      </div>
                    </div>
                    <button
                      onClick={() => handleOpenDiscipline(lvl)}
                      className="flex items-center gap-1 rounded bg-indigo-600/80 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-600 transition-colors"
                    >
                      <span>联动纪律</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main Content: Chart + Right Panel */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left 2 Cols: Lightweight Chart */}
          <div className="space-y-6 lg:col-span-2">
            <HindsightChart
              candles={candles}
              swings={swings}
              selectedRuleResult={selectedRule}
            />

            {/* Key Levels Table */}
            {payload && payload.keyLevels.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-xl">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-sky-400" />
                    <h3 className="text-sm font-semibold text-slate-200">关键支撑防守位与刺穿统计</h3>
                  </div>
                  <span className="text-xs text-slate-400">
                    基于过去 {payload.lookbackYears} 年历史触碰样本
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="pb-2 font-medium">均线/点位</th>
                        <th className="pb-2 font-medium">当前价位</th>
                        <th className="pb-2 font-medium">距离当前价</th>
                        <th className="pb-2 font-medium">触碰/成功防守</th>
                        <th className="pb-2 font-medium">防守成功率</th>
                        <th className="pb-2 font-medium">假跌破率</th>
                        <th className="pb-2 font-medium">建议防守软线</th>
                        <th className="pb-2 text-right font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {payload.keyLevels.map((lvl, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/40">
                          <td className="py-2.5 font-medium text-slate-200">{lvl.sourceRuleTitle}</td>
                          <td className="py-2.5 text-sky-400 font-semibold">{lvl.price.toFixed(2)}</td>
                          <td className={`py-2.5 ${lvl.distancePct >= 0 ? "text-rose-400" : "text-emerald-400"}`}>
                            {lvl.distancePct >= 0 ? `+${lvl.distancePct}%` : `${lvl.distancePct}%`}
                          </td>
                          <td className="py-2.5 text-slate-300">
                            {lvl.touches} 次 (成功 {lvl.indicatorRef ? (lvl.touches! * lvl.indicatorRef.historicalHoldRate).toFixed(0) : lvl.touches} 次)
                          </td>
                          <td className="py-2.5">
                            <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-emerald-400 font-semibold border border-emerald-800/40">
                              {lvl.indicatorRef ? `${(lvl.indicatorRef.historicalHoldRate * 100).toFixed(1)}%` : "100%"}
                            </span>
                          </td>
                          <td className="py-2.5 text-slate-400">
                            {((lvl.falseBreakRate || 0) * 100).toFixed(1)}% (建议确认 {lvl.indicatorRef?.recommendedConfirmDays || 1} 天)
                          </td>
                          <td className="py-2.5 text-amber-300">
                            {lvl.suggestedStop?.toFixed(2)} (容差 {lvl.bufferPct}%)
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              onClick={() => handleOpenDiscipline(lvl)}
                              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-indigo-300 hover:bg-indigo-600 hover:text-white transition-colors"
                            >
                              <span>带入纪律</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right Col: Leaderboard & Swings Drawer */}
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex rounded-xl border border-slate-800 bg-slate-950 p-1">
              <button
                onClick={() => setActiveTab("rules")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors ${
                  activeTab === "rules"
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Flame className="h-3.5 w-3.5" />
                <span>高胜率启动规律 ({hypothesesResults.length})</span>
              </button>
              <button
                onClick={() => setActiveTab("swings")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors ${
                  activeTab === "swings"
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>历史波段档案 ({swings.length})</span>
              </button>
            </div>

            {/* Tab 1: Rules Leaderboard */}
            {activeTab === "rules" && (
              <div className="space-y-3">
                {hypothesesResults.map((hr, idx) => {
                  const isSelected = selectedRule?.hypothesis.id === hr.hypothesis.id;
                  const winRatePct = (hr.winRate * 100).toFixed(1);
                  const baselinePct = (hr.baselineWinRate * 100).toFixed(1);

                  return (
                    <div
                      key={hr.hypothesis.id || idx}
                      onClick={() => setSelectedRule(hr)}
                      className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                        isSelected
                          ? "border-indigo-500 bg-indigo-950/40 shadow-md shadow-indigo-500/10"
                          : "border-slate-800 bg-slate-950 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-100 text-xs sm:text-sm">
                              {hr.hypothesis.title}
                            </span>
                            {/* OOS Badge */}
                            {hr.oosStatus === "oos_validated" && (
                              <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-800/40">
                                外推有效
                              </span>
                            )}
                            {hr.oosStatus === "oos_degraded" && (
                              <span className="rounded bg-rose-950 px-1.5 py-0.5 text-[10px] font-medium text-rose-400 border border-rose-800/40">
                                样本外衰减
                              </span>
                            )}
                            {hr.oosStatus === "oos_untested" && (
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                                样本外未触发
                              </span>
                            )}
                          </div>
                          {hr.hypothesis.aiRationale && (
                            <p className="mt-1 text-[11px] text-slate-400 line-clamp-2">
                              {hr.hypothesis.aiRationale}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-extrabold text-amber-400">
                            {winRatePct}%
                          </div>
                          <div className="text-[10px] text-slate-400">胜率</div>
                        </div>
                      </div>

                      {/* Rule conditions tags */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {hr.hypothesis.conditions.map((cond, cIdx) => (
                          <span
                            key={cIdx}
                            className="rounded-md bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300 border border-slate-800"
                          >
                            {cond.type === "price_near_ma" && `${cond.params.maKey} 均线附近`}
                            {cond.type === "kdj_zone_or_cross" && `KDJ: J < ${cond.params.threshold || 10}`}
                            {cond.type === "rsi_zone" && `RSI < ${cond.params.threshold || 35}`}
                            {cond.type === "macd_state" && `MACD: 金叉/底背离`}
                            {cond.type === "volume_ratio" && `缩量 20%`}
                            {cond.type === "candlestick_pattern" && `${cond.params.pattern} 形态`}
                          </span>
                        ))}
                      </div>

                      {/* Stats footer */}
                      <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
                        <span>
                          触发 {hr.triggerCount} 次 · 达标 {hr.winCount} 次
                        </span>
                        <span className="text-slate-400">
                          基准胜率: {baselinePct}% (超额: +{(hr.winRate * 100 - hr.baselineWinRate * 100).toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tab 2: Swings Drawer */}
            {activeTab === "swings" && (
              <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
                {swings.map((s, idx) => (
                  <div
                    key={`${s.startDate}-${s.peakDate}-${idx}`}
                    className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">
                        波段 #{idx + 1} ({s.startDate} ~ {s.peakDate})
                      </span>
                      <span className="rounded bg-emerald-950 px-2 py-0.5 font-bold text-emerald-400 border border-emerald-800/40">
                        +{(s.gainPct * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                      <div>
                        启动点: <span className="text-slate-200">{s.startPrice.toFixed(2)}</span>
                      </div>
                      <div>
                        波峰点: <span className="text-slate-200">{s.peakPrice.toFixed(2)}</span>
                      </div>
                      <div>
                        持续: <span className="text-slate-200">{s.durationBars} 根K线</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Cross-Tool Discipline Modal */}
      {disciplineUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-indigo-500/40 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-400">
                <ShieldAlert className="h-5 w-5" />
                <h3 className="text-base font-bold text-white">跨工具协议已就绪</h3>
              </div>
              <button
                onClick={() => setDisciplineUrlModal(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-300">
              点位胜率与历史下影刺穿深度已换算为标准 trade-discipline 参数，可直接在计算器中加载并执行硬止损和软线纪律：
            </p>
            <div className="mt-4 rounded-lg bg-slate-950 p-3 text-xs text-slate-300 font-mono break-all border border-slate-800">
              {disciplineUrlModal}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(disciplineUrlModal);
                  alert("联动 URL 已复制到剪贴板！");
                }}
                className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                复制链接
              </button>
              <a
                href={disciplineUrlModal}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                <span>立即打开 trade-discipline</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
