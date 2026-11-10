import { checkAtomCondition } from "./univariatePreScan";
import { conditionLabel } from "./conditionLabel";
import { ConditionAtom, ConditionGap, EvaluationResult, NearTriggerRule, TimelineFeatures } from "./types";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const fmt = (v: number, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits) : "—");

/**
 * Measures how far the latest bar is from satisfying one condition.
 * closeness: 1 = satisfied, decays linearly with the numeric gap; event-type conditions are 0/1.
 */
export function computeConditionGap(feat: TimelineFeatures, atom: ConditionAtom): ConditionGap {
  const label = conditionLabel(atom);
  const satisfied = checkAtomCondition(feat, atom);
  const p = atom.params;
  const done = (current: string): ConditionGap => ({ label, satisfied: true, current, gapText: "已满足", closeness: 1 });
  const notYet = (current: string, gapText: string, closeness: number): ConditionGap =>
    ({ label, satisfied: false, current, gapText, closeness: Number(clamp01(closeness).toFixed(3)) });

  switch (atom.type) {
    case "price_near_ma": {
      const maKey = String(p.maKey || "EMA60");
      const minPct = Number(p.minPct ?? -2.5);
      const maxPct = Number(p.maxPct ?? 2.5);
      const dist = feat.maDistancesPct[maKey];
      const current = `距 ${maKey} ${Number.isFinite(dist) && dist >= 0 ? "+" : ""}${fmt(dist)}%`;
      if (satisfied) return done(current);
      if (!Number.isFinite(dist)) return notYet(current, "均线数据不足", 0);
      return dist > maxPct
        ? notYet(current, `还需回落约 ${fmt(dist - maxPct)}% 进入均线带`, 1 - (dist - maxPct) / 10)
        : notYet(current, `还需反弹约 ${fmt(minPct - dist)}% 回到均线带`, 1 - (minPct - dist) / 10);
    }
    case "kdj_zone_or_cross": {
      const mode = String(p.mode || "j_below");
      const t = Number(p.threshold ?? 10);
      const j = feat.kdj.j;
      if (mode === "j_below" || mode === "j_above") {
        const current = `J=${fmt(j)}`;
        if (satisfied) return done(current);
        const gap = mode === "j_below" ? j - t : t - j;
        return notYet(current, `J 还差 ${fmt(gap)} 到 ${mode === "j_below" ? "≤" : "≥"}${t}`, 1 - gap / 50);
      }
      const current = `K=${fmt(feat.kdj.k)} D=${fmt(feat.kdj.d)}`;
      return satisfied ? done(current) : notYet(current, `等待${mode === "golden_cross" ? "金叉" : "死叉"}`, 0);
    }
    case "rsi_zone": {
      const t = Number(p.threshold ?? 35);
      const current = `RSI=${fmt(feat.rsi)}`;
      if (satisfied) return done(current);
      const gap = p.mode === "above" ? t - feat.rsi : feat.rsi - t;
      return notYet(current, `RSI 还差 ${fmt(gap)}`, 1 - gap / 30);
    }
    case "volume_ratio": {
      const t = Number(p.threshold ?? 0.8);
      const current = `量比=${fmt(feat.volumeRatio20, 2)}`;
      if (satisfied) return done(current);
      const gap = p.mode === "above" ? t - feat.volumeRatio20 : feat.volumeRatio20 - t;
      return notYet(current, `量比还差 ${fmt(gap, 2)}`, 1 - gap);
    }
    case "fib_retracement_near": {
      const ratio = Number(p.ratio ?? 0.618);
      const tol = Number(p.tolerancePct ?? 2.0);
      const lvl = feat.fibLevels.find(f => Math.abs(f.ratio - ratio) < 0.05);
      const dist = lvl ? Math.abs(lvl.distancePct) : NaN;
      const current = `距 ${ratio} 位 ${fmt(dist)}%`;
      if (satisfied) return done(current);
      return notYet(current, `还差 ${fmt(dist - tol)}%`, Number.isFinite(dist) ? 1 - (dist - tol) / 10 : 0);
    }
    case "vpvr_zone_near": {
      const tol = Number(p.tolerancePct ?? 2.0);
      const dist = feat.vpvr ? Math.abs(feat.vpvr.distPocPct) : NaN;
      const current = `距 POC ${fmt(dist)}%`;
      if (satisfied) return done(current);
      return notYet(current, `还差 ${fmt(dist - tol)}%`, Number.isFinite(dist) ? 1 - (dist - tol) / 10 : 0);
    }
    case "ma_consecutive_break": {
      const maKey = String(p.maKey || "EMA5");
      const days = Number(p.days ?? 2);
      const cnt = feat.consecutiveBarsBelow[maKey] || 0;
      const current = `已连续 ${cnt} 天`;
      return satisfied ? done(current) : notYet(current, `还差 ${days - cnt} 天`, cnt / days);
    }
    case "macd_state": {
      const current = `DIF=${fmt(feat.macd.dif, 2)} DEA=${fmt(feat.macd.dea, 2)}`;
      return satisfied ? done(current) : notYet(current, "等待信号出现", 0);
    }
    case "ma_slope_direction": {
      const maKey = String(p.maKey || "EMA60");
      const current = `${maKey} 斜率 ${feat.maSlopes[maKey] ?? "—"}`;
      return satisfied ? done(current) : notYet(current, "斜率未达要求", 0);
    }
    default: {
      // candlestick_pattern and other event-type conditions
      return satisfied ? done("已出现") : notYet("未出现", "等待形态出现", 0);
    }
  }
}

/**
 * Ranks reliable bullish rules by how close the latest bar is to triggering them.
 */
export function buildNearTriggers(
  results: EvaluationResult[],
  latestFeature: TimelineFeatures,
  limit: number = 5
): NearTriggerRule[] {
  return results
    .filter(r =>
      (r.hypothesis.category === "bullish_entry" || r.hypothesis.category === "support_hold") &&
      r.status !== "insufficient_sample"
    )
    .map(r => {
      const conditions = r.hypothesis.conditions.map(c => computeConditionGap(latestFeature, c));
      const closeness = conditions.reduce((a, c) => a + c.closeness, 0) / Math.max(1, conditions.length);
      return {
        ruleId: r.hypothesis.id,
        title: r.hypothesis.title,
        category: r.hypothesis.category,
        winRate: r.winRate,
        winRateLowerBound: r.winRateLowerBound,
        medianGainPct: r.medianGainPct,
        triggerCount: r.triggerCount,
        satisfiedCount: conditions.filter(c => c.satisfied).length,
        totalConditions: conditions.length,
        closeness: Number(closeness.toFixed(3)),
        conditions,
      };
    })
    .sort((a, b) => b.closeness - a.closeness || b.winRateLowerBound - a.winRateLowerBound)
    .slice(0, limit);
}
