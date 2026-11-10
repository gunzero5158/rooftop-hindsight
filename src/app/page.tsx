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
import { SwingSegment, EvaluationResult, MagnitudeProfile, NearTriggerRule } from "@/lib/hindsight/types";
import { conditionLabel } from "@/lib/hindsight/conditionLabel";

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

function medianDuration(swings: SwingSegment[]): number {
  if (swings.length === 0) return 0;
  const sorted = swings.map(s => s.durationBars).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export default function HindsightDashboard() {
  const [symbol, setSymbol] = useState("600519");
  const [market, setMarket] = useState<MarketCode>("CN");
  const [timeframe, setTimeframe] = useState<TimeframeCode>("daily");
  const [minSwingPct, setMinSwingPct] = useState(0.10);
  const [lookbackYears, setLookbackYears] = useState(5);
  const [loading, setLoading] = useState(false);

  // Analysis result states
  const [payload, setPayload] = useState<HindsightSummaryPayload | null>(null);
  const [swings, setSwings] = useState<SwingSegment[]>([]);
  const [magnitudeProfile, setMagnitudeProfile] = useState<MagnitudeProfile | null>(null);
  const [nearTriggers, setNearTriggers] = useState<NearTriggerRule[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [hypothesesResults, setHypothesesResults] = useState<EvaluationResult[]>([]);
  const [selectedRule, setSelectedRule] = useState<EvaluationResult | null>(null);
  const [activeTab, setActiveTab] = useState<"rules" | "swings">("rules");
  const [swingSort, setSwingSort] = useState<"date" | "gain">("gain");
  const [disciplineUrlModal, setDisciplineUrlModal] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);

  const fetchAnalysis = async (customSymbol?: string, customMarket?: MarketCode) => {
    const targetSymbol = customSymbol || symbol;
    const targetMarket = customMarket || market;
    setLoading(true);
    setErrorMsg(null);

    try {
      const url = `/api/hindsight?symbol=${encodeURIComponent(targetSymbol)}&market=${targetMarket}&timeframe=${timeframe}&minSwingPct=${minSwingPct}&years=${lookbackYears}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setPayload(data);
        setSwings(data.swings || []);
        setMagnitudeProfile(data.magnitudeProfile || null);
        setNearTriggers(data.nearTriggers || []);
        setCandles(data.candles || []);
        setIsMock(Boolean(data.isMock));
        // Server already ranks by sample reliability, significance, and Wilson lower bound
        const rules: EvaluationResult[] = data.hypothesesResults || [];
        setHypothesesResults(rules);
        setSelectedRule(rules[0] ?? null);
      } else {
        setErrorMsg(data.error || "分析失败");
      }
    } catch (err) {
      console.error("Failed to run hindsight analysis:", err);
      setErrorMsg("网络请求失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch on mount only
  useEffect(() => {
    fetchAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectPreset = (item: (typeof PRESET_SYMBOLS)[0]) => {
    setSymbol(item.symbol);
    setMarket(item.market);
    fetchAnalysis(item.symbol, item.market);
  };

  const handleOpenDiscipline = (level: HindsightKeyLevel) => {
    if (!payload) return;
    // Prefer close-caliber or selected rule's median gain so target price reflects tradable entry
    const expectedRebound =
      selectedRule?.medianGainPct ||
      magnitudeProfile?.medianCloseGainPct ||
      magnitudeProfile?.medianGainPct;
    const crossParams = keyLevelToCrossToolParams(level, payload.symbol, payload.currentPrice, expectedRebound);
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
                  v0.5.0
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
                  <option value={3} className="bg-slate-900">近 3 年</option>
                  <option value={5} className="bg-slate-900">近 5 年 (推荐)</option>
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
        {errorMsg && (
          <div className="mb-4 rounded-lg border border-rose-800/50 bg-rose-950/40 px-4 py-2.5 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}
        {isMock && !errorMsg && (
          <div className="mb-4 rounded-lg border border-amber-800/50 bg-amber-950/40 px-4 py-2.5 text-xs text-amber-300">
            行情源不可用，当前展示的是合成演示数据，统计结果不代表该标的真实股性。
          </div>
        )}
        {magnitudeProfile?.lowSampleWarning && !errorMsg && (
          <div className="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/30 px-4 py-2 text-xs text-amber-200">
            样本量提示：当前回溯期内有效波段仅 {magnitudeProfile.sampleCount} 个（少于 15 个统计稳健阈值），分位数与归因结论仅供参考，建议拉长回溯年限或降低启动涨幅门槛。
          </div>
        )}
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

            {/* 2. Wave & Rebound Multiplier Summary */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>历史反弹幅度与倍率统计</span>
                <span className="text-[11px] text-indigo-400">
                  回溯 {payload.lookbackYears} 年 · {swings.length} 个波段
                  {magnitudeProfile && magnitudeProfile.ongoingCount > 0 ? ` (${magnitudeProfile.ongoingCount}进行中)` : ""}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800">
                  <div className="text-[11px] text-slate-400">中位反弹 (最低点)</div>
                  <div className="mt-1 text-lg font-bold text-emerald-400">
                    +{magnitudeProfile ? magnitudeProfile.medianGainPct.toFixed(1) : "0.0"}%
                  </div>
                  <div className="text-[10px] text-slate-400">
                    均值 +{magnitudeProfile ? magnitudeProfile.avgGainPct.toFixed(1) : "0.0"}% ({magnitudeProfile ? `${magnitudeProfile.avgMultiplier.toFixed(2)}x` : "1.00x"})
                  </div>
                </div>
                <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800">
                  <div className="text-[11px] text-slate-400">收盘口径 (可交易)</div>
                  <div className="mt-1 text-lg font-bold text-sky-400">
                    +{magnitudeProfile ? magnitudeProfile.medianCloseGainPct.toFixed(1) : "0.0"}%
                  </div>
                  <div className="text-[10px] text-slate-400">
                    P80 +{magnitudeProfile ? magnitudeProfile.p80CloseGainPct.toFixed(1) : "0.0"}% · 均值 +{magnitudeProfile ? magnitudeProfile.avgCloseGainPct.toFixed(1) : "0.0"}%
                  </div>
                </div>
                <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800">
                  <div className="text-[11px] text-slate-400">P80 / 极值上限</div>
                  <div className="mt-1 text-lg font-bold text-amber-400">
                    +{magnitudeProfile ? magnitudeProfile.p80GainPct.toFixed(1) : "0.0"}%
                  </div>
                  <div className="text-[10px] text-slate-400">
                    极值 +{magnitudeProfile ? magnitudeProfile.maxGainPct.toFixed(1) : "0.0"}% · 中位{medianDuration(swings)}根
                  </div>
                </div>
              </div>
              <div className="mt-3 text-[11px] text-slate-400">
                启动门槛 &ge; {(minSwingPct * 100).toFixed(0)}%，联动纪律默认采用可交易的<strong>收盘口径/选中规则中位涨幅</strong>测算目标止盈位。
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

            {/* Rebound Magnitude Distribution & High-Multiple Indicator Drivers */}
            {magnitudeProfile && swings.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-xl">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-slate-200">
                      反弹倍率分档与底部高空间技术指标画像
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400">
                    最低点 ±1 根K线出现何种指标特点时，后续反弹倍率最大
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                  {/* Left: 3-tier rebound magnitude distribution */}
                  <div className="space-y-2.5 md:col-span-2">
                    <div className="text-xs font-medium text-slate-400">波段反弹幅度分档分布</div>
                    {magnitudeProfile.tiers.map((tier, tIdx) => (
                      <div key={tIdx} className="rounded-lg border border-slate-800/80 bg-slate-900/40 p-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-200">{tier.label}</span>
                          <span className="text-slate-400">
                            {tier.count} 次 ({tier.sharePct}%)
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full ${
                              tIdx === 2 ? "bg-amber-400" : tIdx === 1 ? "bg-emerald-400" : "bg-sky-400"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(4, tier.sharePct))}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                          <span>档内均值: <strong className="text-emerald-400">+{tier.avgGainPct}%</strong></span>
                          <span>平均耗时: {tier.avgDurationBars} 根K线</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Right: Top indicator features driving large rebounds */}
                  <div className="md:col-span-3">
                    <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-400">
                      <span>全量历史信号归因（消除幸存者偏差 · 收盘买入前瞻口径）</span>
                      <span className="text-[11px] text-slate-500">
                        全市场基准均值: +{magnitudeProfile.baselineForwardGainPct}%
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                            <th className="pb-1.5 font-medium">技术指标特点</th>
                            <th className="pb-1.5 font-medium">全量触发/胜率</th>
                            <th className="pb-1.5 font-medium">前瞻中位/均值</th>
                            <th className="pb-1.5 font-medium">波段画像命中</th>
                            <th className="pb-1.5 text-right font-medium">相比基准溢价</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {magnitudeProfile.topMagnitudeDrivers.map((drv, dIdx) => (
                            <tr key={dIdx} className="hover:bg-slate-900/40">
                              <td className="py-2 font-medium text-slate-200">{drv.label}</td>
                              <td className="py-2 text-slate-300">
                                {drv.occurrenceCount}次 ({(drv.winRate * 100).toFixed(0)}%)
                              </td>
                              <td className="py-2 font-semibold text-emerald-400">
                                +{drv.medianForwardGainPct}% / +{drv.avgForwardGainPct}% ({(1 + drv.avgForwardGainPct / 100).toFixed(2)}x)
                              </td>
                              <td className="py-2 text-slate-400">
                                {drv.swingHitCount}/{swings.length} 波段 (+{drv.avgSwingGainWhenPresent}%)
                              </td>
                              <td className={`py-2 text-right font-medium ${drv.liftVsBaselinePct >= 0 ? "text-emerald-400" : "text-slate-400"}`}>
                                {drv.liftVsBaselinePct >= 0 ? `+${drv.liftVsBaselinePct}%` : `${drv.liftVsBaselinePct}%`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
            {/* Near-Trigger Proximity Radar */}
            {nearTriggers.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 shadow-lg">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">临近触发监控 (最新K线距离)</span>
                  <span className="text-[10px] text-slate-400">按条件接近度排序</span>
                </div>
                <div className="mt-2.5 space-y-2">
                  {nearTriggers.slice(0, 3).map((nt, nIdx) => (
                    <div
                      key={nt.ruleId || nIdx}
                      className="rounded-lg border border-slate-800/80 bg-slate-900/50 p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-200 truncate">{nt.title}</span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            nt.satisfiedCount === nt.totalConditions
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                              : "bg-indigo-950/70 text-indigo-300 border border-indigo-800/40"
                          }`}
                        >
                          已满足 {nt.satisfiedCount}/{nt.totalConditions} · 接近度 {(nt.closeness * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-1">
                        {nt.conditions.map((c, cIdx) => (
                          <div key={cIdx} className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">{c.label} ({c.current})</span>
                            <span className={c.satisfied ? "text-emerald-400 font-medium" : "text-amber-300"}>
                              {c.gapText}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-slate-100 text-xs sm:text-sm">
                              {hr.hypothesis.title}
                            </span>
                            {/* Significance Badge */}
                            {hr.significant ? (
                              <span className="rounded bg-indigo-950 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300 border border-indigo-800/50">
                                显著 p={hr.pValue.toFixed(3)}
                              </span>
                            ) : (
                              <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-800">
                                p={hr.pValue.toFixed(2)}
                              </span>
                            )}
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
                                样本外待验
                              </span>
                            )}
                          </div>
                          {hr.hypothesis.aiRationale && (
                            <p className="mt-1 text-[11px] text-slate-400 line-clamp-2">
                              {hr.hypothesis.aiRationale}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-lg font-extrabold text-amber-400">
                            {winRatePct}%
                          </div>
                          <div className="text-[10px] text-slate-400">
                            下限 {(hr.winRateLowerBound * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>

                      {/* Rule conditions tags */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {hr.hypothesis.conditions.map((cond, cIdx) => (
                          <span
                            key={cIdx}
                            className="rounded-md bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300 border border-slate-800"
                          >
                            {conditionLabel(cond)}
                          </span>
                        ))}
                      </div>

                      {/* Stats footer */}
                      <div className="mt-3 space-y-1 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
                        <div className="flex items-center justify-between">
                          <span>
                            触发 {hr.triggerCount} 次 · 达标 {hr.winCount} 次
                          </span>
                          <span>
                            基准胜率: {baselinePct}% (超额: +{(hr.winRate * 100 - hr.baselineWinRate * 100).toFixed(1)}%)
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-300">
                          <span>
                            中位/均值: <strong className="text-emerald-400">+{hr.medianGainPct}% / +{hr.averageGainPct}% ({hr.avgMultiplier}x)</strong>
                          </span>
                          <span>
                            极值: <strong className="text-amber-400">+{hr.maxGainPct}%</strong> · 均{hr.avgBarsToPeak}根见顶
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tab 2: Swings Drawer */}
            {activeTab === "swings" && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-1.5 text-xs">
                  <span className="text-slate-400">波段排序方式:</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setSwingSort("gain")}
                      className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                        swingSort === "gain" ? "bg-indigo-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      按反弹倍率从高到低
                    </button>
                    <button
                      onClick={() => setSwingSort("date")}
                      className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                        swingSort === "date" ? "bg-indigo-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      按时间先后
                    </button>
                  </div>
                </div>
                <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                  {[...swings]
                    .sort((a, b) => (swingSort === "gain" ? b.gainPct - a.gainPct : a.startIndex - b.startIndex))
                    .map((s, idx) => (
                      <div
                        key={`${s.startDate}-${s.peakDate}-${idx}`}
                        className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                            <span>#{idx + 1} ({s.startDate} ~ {s.peakDate})</span>
                            {s.ongoing && (
                              <span className="rounded bg-amber-950 px-1.5 py-0.5 text-[10px] text-amber-300 border border-amber-800/50">
                                进行中
                              </span>
                            )}
                          </span>
                          <span className="rounded bg-emerald-950 px-2 py-0.5 font-bold text-emerald-400 border border-emerald-800/40">
                            +{s.gainPct.toFixed(1)}% ({(s.multiplier ?? s.peakPrice / s.startPrice).toFixed(2)}x)
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                          <div>
                            最低/波峰: <span className="text-slate-200">{s.startPrice.toFixed(2)} → {s.peakPrice.toFixed(2)}</span>
                          </div>
                          <div>
                            收盘口径: <span className="text-sky-400">+{s.closeGainPct !== undefined ? s.closeGainPct.toFixed(1) : s.gainPct.toFixed(1)}%</span>
                          </div>
                          <div>
                            持续: <span className="text-slate-200">{s.durationBars} 根K线</span>
                          </div>
                        </div>
                        {s.entryFeatures && (
                          <div className="mt-2.5 border-t border-slate-800/70 pt-2">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                              <span>最低点指标:</span>
                              <span>KDJ J=<strong className="text-slate-200">{s.entryFeatures.kdjJ}</strong></span>
                              <span>RSI=<strong className="text-slate-200">{s.entryFeatures.rsi}</strong></span>
                              <span>量比=<strong className="text-slate-200">{s.entryFeatures.volumeRatio20}</strong></span>
                              {s.entryFeatures.nearestMa && (
                                <span className="text-sky-400">{s.entryFeatures.nearestMa}</span>
                              )}
                            </div>
                            {s.entryFeatures.matchedTags.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {s.entryFeatures.matchedTags.map((tag, tIdx) => (
                                  <span
                                    key={tIdx}
                                    className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-indigo-300 border border-slate-800"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
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
