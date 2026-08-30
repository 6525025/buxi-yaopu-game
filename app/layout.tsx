import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "不息药铺｜策略消除小游戏",
  description: "在百鬼夜市经营一间药铺：配药、连择、控晦气，用有限回合完成四张灵客药方。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
