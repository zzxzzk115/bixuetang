import Link from "next/link";
import { Coins, Flame, LogOut, Settings, ShieldCheck } from "lucide-react";
import { GuildNavigation } from "@/components/guild-navigation";
import { GuildSigil } from "@/components/guild-sigil";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/user-avatar";
import { logout } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { learningStreak } from "@/lib/game/achievements";
import { getRpgProfile } from "@/lib/game/rpg-server";
import { getUserProgress } from "@/lib/progress/queries";

// 站点外壳（顶栏 HUD + 底部导航 + 页脚），包住除全屏游戏外的所有页面。
// 从根 layout 下移到此，好让 (game) 路由组走无壳全屏布局。

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;
  const streak = user ? learningStreak(user.id) : 0;
  const rpg = user ? getRpgProfile(user.id) : null;

  return (
    <div className="guild-app">
      <header className="game-top-hud">
        <Link href="/" className="game-brand" aria-label="返回学者公会">
          <GuildSigil size={34} className="guild-sigil" />
          <span className="game-brand-copy">
            <b>学者公会</b>
            <small>ACADEMIC ADVENTURE</small>
          </span>
        </Link>

        {user && progress ? (
          <Link href="/me" className="game-player-hud">
            <UserAvatar
              userId={user.id}
              avatar={user.avatar}
              name={user.displayName || user.username}
            />
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
          {rpg && (
            <span className="game-resource coin" title="固定规则结算的金币">
              <Coins aria-hidden size={15} />
              <b>{rpg.coins}</b>
              <small>金币</small>
            </span>
          )}
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
        <span>GUILD CAMPAIGN · BUILD G1</span>
        <span>学习记录已接入 · 视频版权归原平台与上传者所有</span>
      </footer>
    </div>
  );
}
