import { ConditionAtom } from "./types";

/**
 * Human-readable Chinese label for a ConditionAtom (shared by UI and server-side gap reports).
 */
export function conditionLabel(cond: ConditionAtom): string {
  const p = cond.params;
  switch (cond.type) {
    case "price_near_ma":
      return `${p.maKey} ${p.minPct ?? -2.5}%~+${p.maxPct ?? 2.5}%`;
    case "kdj_zone_or_cross":
      if (p.mode === "golden_cross") return "KDJ 金叉";
      if (p.mode === "death_cross") return "KDJ 死叉";
      return `KDJ: J ${p.mode === "j_above" ? ">" : "<"} ${p.threshold ?? 10}`;
    case "rsi_zone":
      return `RSI ${p.mode === "above" ? ">" : "<"} ${p.threshold ?? 35}`;
    case "macd_state":
      return (
        { golden_cross: "MACD 金叉", bottom_divergence: "MACD 底背离", top_divergence: "MACD 顶背离", hist_positive: "MACD 红柱" } as Record<string, string>
      )[String(p.mode)] ?? "MACD";
    case "volume_ratio":
      return `量比 ${p.mode === "above" ? ">" : "<"} ${p.threshold ?? 0.8}`;
    case "candlestick_pattern":
      return `${p.pattern} 形态`;
    case "fib_retracement_near":
      return `斐波那契 ${p.ratio} 附近`;
    case "vpvr_zone_near":
      return "筹码峰 POC 附近";
    case "ma_consecutive_break":
      return `连续 ${p.days} 天跌破 ${p.maKey}`;
    case "ma_slope_direction":
      return `${p.maKey} 斜率${p.direction === "up" ? "向上" : p.direction === "down" ? "向下" : "走平"}`;
    default:
      return cond.type;
  }
}
