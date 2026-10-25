import { MarketCode } from "../shared-types/interop";

export function isShanghaiAShareCode(code: string): boolean {
  return code.startsWith("60") || code.startsWith("68") || code.startsWith("90");
}

export function aShareCodeToSuffixedSymbol(code: string): string {
  return isShanghaiAShareCode(code) ? `${code}.SS` : `${code}.SZ`;
}

export function detectMarket(symbol: string): MarketCode {
  const clean = symbol.trim().toUpperCase();
  if (/^\d{6}(?:\.(?:SS|SH|SZ))?$/.test(clean)) return "CN";
  if (/^\d{1,5}(?:\.HK)?$/.test(clean)) return "HK";
  if (/^\d{3}[0-9A-Z]\.T$/.test(clean)) return "JP";
  return "US";
}

export function normalizeSymbol(raw: string): string {
  const clean = raw.trim().toUpperCase();
  if (!clean) return "";

  // 600519 -> 600519.SS
  if (/^\d{6}$/.test(clean)) {
    return aShareCodeToSuffixedSymbol(clean);
  }
  // 600519.SH -> 600519.SS
  if (clean.endsWith(".SH")) {
    return clean.replace(".SH", ".SS");
  }

  // 0700 -> 0700.HK
  const hk = clean.match(/^(\d{1,5})(?:\.HK)?$/);
  if (hk) {
    const rawCode = hk[1];
    const code = rawCode.length === 5 && rawCode.startsWith("0") && !rawCode.startsWith("00")
      ? rawCode
      : String(Number(rawCode)).padStart(4, "0");
    return `${code}.HK`;
  }

  // 7203 -> 7203.T
  if (/^\d{3}[0-9A-Z]$/.test(clean)) {
    return `${clean}.T`;
  }

  return clean;
}

export function convertSymbolToEastMoneySecid(symbol: string): string | null {
  const clean = normalizeSymbol(symbol);

  if (clean.endsWith(".SS")) {
    return `1.${clean.split(".")[0]}`;
  }
  if (clean.endsWith(".SZ")) {
    return `0.${clean.split(".")[0]}`;
  }
  if (clean.endsWith(".HK")) {
    const code = clean.split(".")[0].padStart(5, "0");
    return `116.${code}`;
  }
  if (clean.endsWith(".T")) {
    return `176.${clean.slice(0, -2)}`;
  }
  if (/^[A-Z]{1,5}$/.test(clean)) {
    return `105.${clean}`;
  }
  return null;
}
