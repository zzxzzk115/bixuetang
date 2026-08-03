import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { CelebrationLayer } from "@/components/celebration-layer";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth/session";
import { logout } from "@/lib/auth/actions";
import { getUserProgress } from "@/lib/progress/queries";

export const metadata: Metadata = {
  title: { default: "学者公会 Guild", template: "%s · 学者公会" },
  description:
    "游戏闯关式理科自学网站：公开课副本、技能树、冒险路径与转职系统。",
};

const NAV_ITEMS = [
  { href: "/paths", label: "远征路径" },
  { href: "/courses", label: "副本档案" },
  { href: "/skill-tree", label: "技能星盘" },
  { href: "/jobs", label: "转职殿堂" },
  { href: "/lab", label: "实验工坊" },
  { href: "/glossary", label: "术语卷宗" },
];

async function Nav() {
  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;

  return (
    <header className="guild-header">
      <nav className="guild-nav" aria-label="公会导航">
        <Link href="/" className="guild-brand">
          <span className="guild-sigil" aria-hidden="true">
            G
          </span>
          <span>
            <span className="guild-wordmark">学者公会</span>
            <span className="guild-submark">SCHOLAR GUILD // M6</span>
          </span>
        </Link>

        <div className="guild-links">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="guild-nav-link">
              {item.label}
            </Link>
          ))}
        </div>

        <div className="guild-account">
          <ThemeToggle />
          {user && progress ? (
            <>
              <Link href="/me" className="guild-level">
                <strong>LV.{progress.level.level}</strong>
                <span className="account-name">
                  {user.displayName || user.username}
                </span>
              </Link>
              <Link
                href="/settings"
                className="hud-icon-button"
                title="角色设置"
                aria-label="角色设置"
              >
                ⚙
              </Link>
              <form action={logout}>
                <button className="logout-button text-xs text-muted hover:text-foreground">
                  离线
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="account-name text-xs text-muted hover:text-foreground">
                登录
              </Link>
              <Link href="/register" className="command-button">
                建立档案
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("guild-theme")||"auto";var d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <CelebrationLayer />
        <Nav />
        <main className="guild-main">{children}</main>
        <footer className="guild-footer">
          <div className="guild-footer-inner">
            <span>GUILD ARCHIVE · BUILD M6 · 学习记录已接入</span>
            <span>视频版权归原平台与上传者所有 · 本站仅整理与外链</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
