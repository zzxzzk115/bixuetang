import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { CelebrationLayer } from "@/components/celebration-layer";
import { DevLanQr } from "@/components/dev-lan-qr";
import { PwaRegister } from "@/components/pwa-register";
import { QuestCompleteWatcher } from "@/components/quest-complete-watcher";
import { RewardToastLayer } from "@/components/reward-toast";

// 管理端(admin. 子域)与游戏端同一个 Next 服务,但要各自的 PWA 身份/标题。
// middleware 命中管理端时打了请求头 x-admin-console,这里据此切两套元数据。
export async function generateMetadata(): Promise<Metadata> {
  const isAdminConsole =
    (await headers()).get("x-admin-console") === "1";
  if (isAdminConsole) {
    return {
      title: { default: "必学堂管理端", template: "%s · 必学堂管理端" },
      description: "必学堂运营后台。",
      manifest: "/console.webmanifest",
      appleWebApp: {
        capable: true,
        title: "必学堂管理端",
        statusBarStyle: "black-translucent",
      },
      formatDetection: { telephone: false },
      // 管理端不希望被搜索引擎收录
      robots: { index: false, follow: false },
    };
  }
  return {
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
}

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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 设备形态由服务端 UA 判定后写进 data-device,前端按它切交互
  // (桌面「复制图片」/移动「保存图片」等)——不靠分辨率猜。
  // iPad 桌面版 UA 伪装成 Mac,由 PwaRegister 在客户端用触点数矫正。
  const requestHeaders = await headers();
  const ua = requestHeaders.get("user-agent") ?? "";
  const device = /Mobi|Android|iPhone|iPad|HarmonyOS/i.test(ua)
    ? "mobile"
    : "desktop";
  // 管理端:走独立 SW,不挂游戏端的庆祝/奖励/任务/局域网二维码层
  const isAdminConsole = requestHeaders.get("x-admin-console") === "1";

  // 开发环境把本机局域网地址下发给前端:分享链接/调试二维码都用它,
  // 手机扫码即可访问 dev 服务(localhost 对别的设备毫无意义)。
  // 生产构建 NODE_ENV=production,这段整体不存在。
  let lanOrigin: string | null = null;
  if (process.env.NODE_ENV === "development") {
    const os = await import("node:os");
    const port = (requestHeaders.get("host") ?? "").split(":")[1] ?? "3000";
    // 真实私网段优先:VPN/虚拟网卡(198.18/15 基准段、169.254 链路本地)
    // 常排在枚举前面,直接取第一个会拿到手机根本连不上的地址
    const rank = (ip: string) =>
      ip.startsWith("192.168.") ? 0
      : ip.startsWith("10.") ? 1
      : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2
      : ip.startsWith("198.18.") || ip.startsWith("169.254.") ? 9
      : 5;
    const candidates: string[] = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const ni of list ?? []) {
        if (ni.family === "IPv4" && !ni.internal) candidates.push(ni.address);
      }
    }
    candidates.sort((a, b) => rank(a) - rank(b));
    const best = candidates.find((ip) => rank(ip) < 9);
    if (best) lanOrigin = `http://${best}:${port}`;
  }

  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      data-device={device}
      data-lan-origin={lanOrigin ?? undefined}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {isAdminConsole ? (
          <PwaRegister swPath="/console-sw.js" />
        ) : (
          <>
            <PwaRegister />
            <CelebrationLayer />
            <RewardToastLayer />
            <QuestCompleteWatcher />
            <DevLanQr />
          </>
        )}
        {children}
      </body>
    </html>
  );
}
