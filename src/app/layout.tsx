import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "天台马后炮 (Rooftop Hindsight) - 股票历史拐点共性挖掘与点位回测工具",
  description: "基于股票历史上涨区间的启动共性指标与形态特征挖掘买点规律，计算点位胜率，跨工具联动交易纪律",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
