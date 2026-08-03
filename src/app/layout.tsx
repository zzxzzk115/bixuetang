import type { Metadata } from "next";
import "./globals.css";
import { CelebrationLayer } from "@/components/celebration-layer";

export const metadata: Metadata = {
  title: { default: "学者公会 Guild", template: "%s · 学者公会" },
  description: "面向中文学习者的游戏化理科自学公会。",
};

// 根 layout 只保留 html/body/防闪烁主题脚本/全局庆祝层。
// 站点外壳（顶栏 HUD + 导航）下移到 (site)/layout.tsx——这样 (game) 路由组
// 可以走无壳全屏布局，让 Phaser 占满视口。
const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("guild-theme")||"auto";var d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <CelebrationLayer />
        {children}
      </body>
    </html>
  );
}
