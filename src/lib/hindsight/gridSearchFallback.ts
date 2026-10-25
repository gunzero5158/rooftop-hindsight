import { Candle } from "../shared-types/interop";
import { AtomPreScanResult, preScanCandidateAtoms } from "./univariatePreScan";
import { KeyLevelTouchStat } from "./keyLevelStats";
import { evaluateHypothesis } from "./hypothesisEvaluator";
import { EvaluationResult, HindsightHypothesis, SwingSegment, TimelineFeatures } from "./types";

/**
 * Builds local rule hypotheses from pre-scanned atoms and key levels.
 */
export function generateLocalHypotheses(
  preScanned: AtomPreScanResult[],
  keyLevels?: KeyLevelTouchStat[]
): HindsightHypothesis[] {
  const topAtoms = preScanned.filter(p => p.hitCountInSwings >= 2).slice(0, 8);
  const hypotheses: HindsightHypothesis[] = [];

  // Single atom hypotheses
  for (const item of topAtoms) {
    hypotheses.push({
      id: `local_single_${item.atom.type}_${Math.random().toString(36).slice(2, 6)}`,
      category: "bullish_entry",
      title: item.label,
      conditions: [item.atom],
      aiRationale: `历史波段中高频出现（${item.hitCountInSwings}/${item.totalSwings} 次底部符合特征）`,
    });
  }

  // Cross combinations
  for (let i = 0; i < Math.min(5, topAtoms.length); i++) {
    for (let j = i + 1; j < Math.min(6, topAtoms.length); j++) {
      const a = topAtoms[i];
      const b = topAtoms[j];
      if (a.atom.type === b.atom.type) continue;

      hypotheses.push({
        id: `local_pair_${i}_${j}`,
        category: "bullish_entry",
        title: `${a.label} 且 ${b.label}`,
        conditions: [a.atom, b.atom],
        aiRationale: `双指标共振：${a.label} 叠加 ${b.label}`,
      });
    }
  }

  // Support-hold hypotheses
  if (keyLevels) {
    const strongMAs = keyLevels.filter(k => k.totalTouches >= 3 && k.holdRate >= 0.7);
    for (const sm of strongMAs.slice(0, 3)) {
      hypotheses.push({
        id: `local_hold_${sm.maKey}`,
        category: "support_hold",
        title: `${sm.maKey} 均线附近支撑防守`,
        conditions: [
          { type: "price_near_ma", params: { maKey: sm.maKey, minPct: -2.5, maxPct: 2.5 } },
        ],
        aiRationale: `历史触碰 ${sm.totalTouches} 次，成功防守率 ${(sm.holdRate * 100).toFixed(1)}%`,
      });
    }
  }

  // Breakdown risk hypotheses
  hypotheses.push({
    id: "local_breakdown_ema5",
    category: "breakdown_risk",
    title: "连续 2 天收盘跌破 EMA5",
    conditions: [{ type: "ma_consecutive_break", params: { maKey: "EMA5", days: 2 } }],
    aiRationale: "短期均线连续失守破位特征",
  });

  return hypotheses;
}


/**
 * Fallback grid search engine to generate hypotheses when LLM is offline or no API key is provided.
 */
export function runLocalGridSearch(
  candles: Candle[],
  timeline: TimelineFeatures[],
  successfulSwings: SwingSegment[],
  failedRebounds: SwingSegment[],
  minSwingPct: number = 0.10,
  horizonBars: number = 40
): EvaluationResult[] {
  // 1. Pre-scan single atoms
  const preScanned = preScanCandidateAtoms(timeline, successfulSwings, failedRebounds);
  const topAtoms = preScanned.filter(p => p.hitCountInSwings >= 2).slice(0, 8);

  const hypotheses: HindsightHypothesis[] = [];

  // Single atom hypotheses
  for (const item of topAtoms) {
    hypotheses.push({
      id: `local_single_${item.atom.type}_${Math.random().toString(36).slice(2, 6)}`,
      category: "bullish_entry",
      title: item.label,
      conditions: [item.atom],
      aiRationale: `历史波段中高频出现（${item.hitCountInSwings}/${item.totalSwings} 次底部符合特征）`,
    });
  }

  // 2. Dual atom combinations (cross combinations of top atoms)
  for (let i = 0; i < Math.min(5, topAtoms.length); i++) {
    for (let j = i + 1; j < Math.min(6, topAtoms.length); j++) {
      const a = topAtoms[i];
      const b = topAtoms[j];
      if (a.atom.type === b.atom.type) continue; // Don't combine identical types

      hypotheses.push({
        id: `local_pair_${i}_${j}`,
        category: "bullish_entry",
        title: `${a.label} 且 ${b.label}`,
        conditions: [a.atom, b.atom],
        aiRationale: `双指标共振：${a.label} 叠加 ${b.label}`,
      });
    }
  }

  // 3. Breakdown risk hypotheses
  hypotheses.push({
    id: "local_breakdown_ema5",
    category: "breakdown_risk",
    title: "连续 2 天收盘跌破 EMA5",
    conditions: [{ type: "ma_consecutive_break", params: { maKey: "EMA5", days: 2 } }],
    aiRationale: "短期均线连续失守破位特征",
  });

  hypotheses.push({
    id: "local_breakdown_ema20",
    category: "breakdown_risk",
    title: "连续 2 天收盘跌破 EMA20",
    conditions: [{ type: "ma_consecutive_break", params: { maKey: "EMA20", days: 2 } }],
    aiRationale: "中期生命线连续失守破位特征",
  });

  // 4. Bearish peak hypotheses
  hypotheses.push({
    id: "local_peak_kdj_overbought",
    category: "bearish_peak",
    title: "KDJ 的 J > 100 且 冲高滞涨",
    conditions: [
      { type: "kdj_zone_or_cross", params: { mode: "j_above", threshold: 100 } },
      { type: "candlestick_pattern", params: { pattern: "shooting_star" } },
    ],
    aiRationale: "动量严重超买叠加射击之星滞涨",
  });

  // Evaluate all hypotheses on history
  const results: EvaluationResult[] = [];
  for (const h of hypotheses) {
    const res = evaluateHypothesis(candles, timeline, h, { minSwingPct, horizonBars });
    // Filter out rules with 0 triggers
    if (res.triggerCount > 0) {
      results.push(res);
    }
  }

  // Sort by winRate descending, then triggerCount
  results.sort((a, b) => b.winRate - a.winRate || b.triggerCount - a.triggerCount);

  return results;
}
