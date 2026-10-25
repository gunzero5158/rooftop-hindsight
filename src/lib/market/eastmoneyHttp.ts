import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { Candle } from "../shared-types/interop";

const keepAliveAgent = new HttpsAgent({ keepAlive: true, maxSockets: 16 });
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

const EAST_MONEY_KLINE_HOSTS = [
  "push2his.eastmoney.com",
  "1.push2his.eastmoney.com",
  "2.push2his.eastmoney.com",
  "3.push2his.eastmoney.com",
  "4.push2his.eastmoney.com",
  "5.push2his.eastmoney.com",
];

export async function fetchEastMoneyJson<T>(url: string, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        agent: keepAliveAgent,
        timeout: timeoutMs,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://quote.eastmoney.com/",
          Accept: "application/json,*/*",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let receivedBytes = 0;

        res.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_RESPONSE_BYTES) {
            req.destroy(new Error(`EastMoney response exceeded limit`));
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`EastMoney request failed (${res.statusCode || "unknown"})`));
            return;
          }

          try {
            resolve(JSON.parse(text) as T);
          } catch (error: unknown) {
            reject(error);
          }
        });
      }
    );

    const deadline = setTimeout(() => {
      req.destroy(new Error("EastMoney deadline exceeded"));
    }, timeoutMs);

    req.on("close", () => clearTimeout(deadline));
    req.on("timeout", () => req.destroy(new Error("EastMoney timeout")));
    req.on("error", reject);
    req.end();
  });
}

export async function fetchEastMoneyKlines(
  secid: string,
  timeframe: "daily" | "weekly",
  limit: number
): Promise<Candle[]> {
  const klt = timeframe === "weekly" ? "102" : "101";

  for (const host of EAST_MONEY_KLINE_HOSTS) {
    try {
      const params = new URLSearchParams({
        secid,
        fields1: "f1,f2,f3,f4,f5,f6",
        fields2: "f51,f52,f53,f54,f55,f56",
        klt,
        fqt: "1", // Forward-adjusted QFQ
        beg: "19900101",
        end: "20991231",
        lmt: String(limit),
        ut: "fa5fd190ac2ec2c49a057690f96c340f",
      });
      const url = `https://${host}/api/qt/stock/kline/get?${params.toString()}`;
      const data = await fetchEastMoneyJson<{ data?: { klines?: string[] } }>(url, 3500);
      const klines = data?.data?.klines;
      if (!klines || klines.length === 0) continue;

      return klines.map((item) => {
        const parts = item.split(",");
        return {
          date: parts[0],
          open: parseFloat(parts[1]),
          close: parseFloat(parts[2]),
          high: parseFloat(parts[3]),
          low: parseFloat(parts[4]),
          volume: parseInt(parts[5], 10) || 0,
        };
      });
    } catch {
      // Try next host
    }
  }

  throw new Error(`Failed to fetch EastMoney K-lines for ${secid}`);
}
