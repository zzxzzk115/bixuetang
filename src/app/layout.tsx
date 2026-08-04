import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CelebrationLayer } from "@/components/celebration-layer";

export const metadata: Metadata = {
  title: { default: "必学堂", template: "%s · 必学堂" },
  description: "把公开课学成通关——面向中文学习者的游戏化自学工具。",
  // 添加到主屏后按 App 打开：图标、标题栏配色、全屏行为都在 manifest.ts 里
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "必学堂",
    // 状态栏文字随内容走，深色主题下不会变成黑底黑字
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // 主题色决定安卓任务栏与 PWA 标题栏的底色，跟随亮/暗主题
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#58cc02" },
    { media: "(prefers-color-scheme: dark)", color: "#12160f" },
  ],
  width: "device-width",
  initialScale: 1,
  // 别锁死缩放——放大看公式是刚需，无障碍也要求可缩放
  maximumScale: 5,
  // 刘海屏：内容铺到安全区外，各页自己用 env(safe-area-inset-*) 留白
  viewportFit: "cover",
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
