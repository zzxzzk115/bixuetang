import type { Metadata } from "next";
import Link from "next/link";
import { Flame, LogOut, Settings, ShieldCheck } from "lucide-react";
import "./globals.css";
import { CelebrationLayer } from "@/components/celebration-layer";
import { GuildNavigation } from "@/components/guild-navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { logout } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { learningStreak } from "@/lib/game/achievements";
import { getUserProgress } from "@/lib/progress/queries";

export const metadata: Metadata = {
  title: { default: "学者公会 Guild", template: "%s · 学者公会" },
  description: "面向中文学习者的游戏化理科自学公会。",
};

async function GuildShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;
  const streak = user ? learningStreak(user.id) : 0;

  return (
    <div className="guild-app">
      <header className="game-top-hud">
        <Link href="/" className="game-brand" aria-label="返回学者公会">
          <span className="guild-sigil">G</span>
          <span className="game-brand-copy">
            <b>学者公会</b>
            <small>ACADEMIC ADVENTURE</small>
          </span>
        </Link>

        {user && progress ? (
          <Link href="/me" className="game-player-hud">
            <span className="game-avatar">{(user.displayName || user.username).slice(0, 1).toUpperCase()}</span>
            <span className="game-player-copy">
              <span><b>{user.displayName || user.username}</b><small>见习学者</small></span>
              <span className="game-xp-line">
                <i style={{ width: `${Math.round(progress.level.ratio * 100)}%` }} />
              </span>
              <span className="game-xp-label">LV.{progress.level.level} · {progress.level.current}/{progress.level.span} XP</span>
            </span>
          </Link>
        ) : (
          <div className="game-player-hud guest">
            <span className="game-avatar"><ShieldCheck aria-hidden size={19} /></span>
            <span className="game-player-copy"><b>未登记冒险者</b><small>建立档案后同步成长</small></span>
          </div>
        )}

        <div className="game-resources">
          {user && (
            <span className="game-resource" title="连续学习天数">
              <Flame aria-hidden size={15} />
              <b>{streak}</b>
              <small>连胜</small>
            </span>
          )}
          <ThemeToggle />
          {user && (
            <Link href="/settings" className="hud-icon-button" title="系统设置">
              <Settings aria-hidden size={17} />
            </Link>
          )}
          {user ? (
            <form action={logout}>
              <button className="hud-icon-button" title="离开公会">
                <LogOut aria-hidden size={16} />
              </button>
            </form>
          ) : (
            <div className="game-auth-actions">
              <Link href="/login" className="command-button secondary">登录</Link>
              <Link href="/register" className="command-button">建立角色</Link>
            </div>
          )}
        </div>
      </header>

      <main className="guild-stage">{children}</main>
      <GuildNavigation loggedIn={!!user} />

      <footer className="guild-footer">
        <span>GUILD ARCHIVE · BUILD M7</span>
        <span>学习记录已接入 · 视频版权归原平台与上传者所有</span>
      </footer>
    </div>
  );
}

const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("guild-theme")||"auto";var d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body className="min-h-full">
        <CelebrationLayer />
        <GuildShell>{children}</GuildShell>
      </body>
    </html>
  );
}
