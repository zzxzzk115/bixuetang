import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth/session";
import { logout } from "@/lib/auth/actions";
import { getUserProgress } from "@/lib/progress/queries";

export const metadata: Metadata = {
  title: { default: "学者公会 Guild", template: "%s · 学者公会" },
  description: "游戏闯关式理科自学网站：公开课副本、技能树与转职系统",
};

async function Nav() {
  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;

  return (
    <header className="sticky top-0 z-20 border-b border-edge bg-background/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-5 px-4 py-3 text-sm">
        <Link href="/" className="flex items-center gap-1.5 font-bold text-gold">
          🏰 学者公会
        </Link>
        <Link href="/paths" className="text-muted hover:text-foreground">
          冒险路径
        </Link>
        <Link href="/courses" className="text-muted hover:text-foreground">
          副本图鉴
        </Link>
        <div className="ml-auto flex items-center gap-3">
          {user && progress ? (
            <>
              <Link
                href="/me"
                className="flex items-center gap-2 rounded border border-edge bg-panel px-2.5 py-1 hover:border-gold"
              >
                <span className="font-bold text-gold">
                  Lv.{progress.level.level}
                </span>
                <span>{user.displayName || user.username}</span>
              </Link>
              <form action={logout}>
                <button className="text-xs text-muted hover:text-foreground">
                  登出
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-muted hover:text-foreground">
                登录
              </Link>
              <Link
                href="/register"
                className="rounded border border-gold px-3 py-1 text-gold hover:bg-gold hover:text-background"
              >
                创建角色
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-edge py-6 text-center text-xs text-muted">
          学者公会 Guild · 视频版权归原平台与上传者所有，本站仅做整理与外链
        </footer>
      </body>
    </html>
  );
}
