import Link from "next/link";
import { Bug, ChevronRight, Download, ExternalLink, LogOut, Sparkles, Star } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { BiliBind } from "@/components/app/bili-bind";
import { getBiliBinding } from "@/lib/bili/account";
import { AvatarForm } from "@/components/app/avatar-form";
import { EmailForm, PasswordForm, ProfileForm } from "@/components/settings-forms";
import { WellbeingControls } from "@/components/app/wellbeing-controls";
import { getWellbeing } from "@/lib/game/wellbeing-actions";
import { PushToggle } from "@/components/push-toggle";
import { PushExtras } from "@/components/push-extras";
import { getEmailPrefs } from "@/lib/game/user-state";
import { UserAvatar } from "@/components/user-avatar";
import { logout } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";

export const metadata = { title: "设置" };

const REPO = "https://github.com/zzxzzk115/bixuetang";

// lucide 新版移除了 Github 品牌图标，内联官方 GitHub mark
function GithubMark() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden>
      <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.2 3.44 9.6 8.2 11.16.6.11.82-.25.82-.56 0-.28-.01-1.02-.02-2-3.34.71-4.04-1.58-4.04-1.58-.55-1.37-1.34-1.74-1.34-1.74-1.09-.73.08-.72.08-.72 1.2.08 1.84 1.22 1.84 1.22 1.07 1.8 2.81 1.28 3.5.98.11-.76.42-1.28.76-1.58-2.67-.3-5.47-1.31-5.47-5.83 0-1.29.47-2.34 1.24-3.17-.12-.3-.54-1.52.12-3.16 0 0 1.01-.32 3.3 1.21a11.6 11.6 0 016 0c2.29-1.53 3.3-1.21 3.3-1.21.66 1.64.24 2.86.12 3.16.77.83 1.24 1.88 1.24 3.17 0 4.53-2.81 5.53-5.49 5.82.43.36.81 1.09.81 2.2 0 1.59-.01 2.87-.01 3.26 0 .31.22.68.83.56A12.02 12.02 0 0024 12.29C24 5.78 18.63.5 12 .5z" />
    </svg>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const bootstrap = getGameBootstrap(user);
  const binding = getBiliBinding(user.id);

  const ratio = Math.round(bootstrap.level.ratio * 100);
  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page me-root">
        {/* 个人名片：头像 + 等级进度，桌面右栏之外移动端也看得到 */}
        <section className="me-hero">
          <UserAvatar
            userId={user.id}
            avatar={user.avatar}
            name={user.displayName || user.username}
            size={64}
          />
          <div className="me-hero-body">
            <h1>{user.displayName || user.username}</h1>
            <small>
              Lv.{bootstrap.level.level} · {bootstrap.level.current}/
              {bootstrap.level.span} XP · 战力 {bootstrap.rpg.power}
            </small>
            <div className="me-hero-bar">
              <i style={{ width: `${ratio}%` }} />
            </div>
          </div>
        </section>

        <section className="course-card">
          <div className="course-card-head">
            <h2>角色资料</h2>
          </div>
          <p className="me-note">用户名：{user.username}</p>
          <div className="app-skin">
            <ProfileForm
              displayName={user.displayName ?? ""}
              biliNickname={binding?.nickname ?? null}
              username={user.username}
            />
          </div>
        </section>

        <section className="course-card">
          <div className="course-card-head">
            <h2>外观</h2>
          </div>
          {/* 主题切换随旧壳一起下线了，但功能本身还在——新壳得给回入口 */}
          <div className="settings-theme">
            <span>配色</span>
            <ThemeToggle />
          </div>
        </section>

        <section className="course-card">
          <div className="course-card-head">
            <h2>头像</h2>
          </div>
          <div className="app-skin">
            <AvatarForm
              avatar={user.avatar}
              userId={user.id}
              biliAvatarUrl={binding?.avatarUrl ?? null}
            />
          </div>
        </section>

        <section className="course-card">
          <div className="course-card-head">
            <h2>bilibili 账号</h2>
          </div>
          <BiliBind binding={getBiliBinding(user.id)} />
        </section>

        <section className="course-card">
          <div className="course-card-head">
            <h2>学习提醒</h2>
          </div>
          <p className="me-note">
            开启后,复习卡到期或断签时会推送提醒,帮你别忘了回来学。需先把必学堂
            安装为 App(添加到主屏)。
          </p>
          <div className="app-skin">
            <PushToggle />
            {(() => {
              const prefs = getEmailPrefs(user.id);
              return (
                <PushExtras
                  emailRecall={prefs.recall}
                  emailWeekly={prefs.weekly}
                  emailVerified={user.emailVerified}
                />
              );
            })()}
          </div>
        </section>

        <section className="course-card">
          <div className="course-card-head">
            <h2>找回邮箱</h2>
          </div>
          <p className="me-note">
            绑定邮箱后,忘记密码时可自助收重置链接。不绑也能用,但只能靠 bilibili
            扫码登录或联系管理员找回。
          </p>
          <div className="app-skin">
            <EmailForm email={user.email ?? null} verified={user.emailVerified} />
          </div>
        </section>

        <section className="course-card">
          <div className="course-card-head">
            <h2>修改密码</h2>
          </div>
          <div className="app-skin">
            <PasswordForm />
          </div>
        </section>

        <section className="course-card">
          <div className="course-card-head">
            <h2>静心与休息</h2>
          </div>
          <div className="app-skin">
            <WellbeingControls initial={await getWellbeing()} />
          </div>
        </section>

        <section className="course-card">
          <Link href="/journey" className="settings-nav-row">
            <span className="settings-nav-icon" style={{ background: "var(--app-purple)" }}>
              <Sparkles size={18} aria-hidden />
            </span>
            <span className="settings-nav-body">
              <b>学习足迹</b>
              <small>看看你一路走来学了多少——为自己骄傲一下</small>
            </span>
            <ChevronRight size={18} aria-hidden />
          </Link>
        </section>

        <section className="course-card">
          <Link href="/export" className="settings-nav-row">
            <span className="settings-nav-icon" style={{ background: "var(--app-teal)" }}>
              <Download size={18} aria-hidden />
            </span>
            <span className="settings-nav-body">
              <b>导出与联动</b>
              <small>笔记导出到 Obsidian / Anki，或用 API 接自己的工具</small>
            </span>
            <ChevronRight size={18} aria-hidden />
          </Link>
        </section>

        <section className="course-card">
          <div className="course-card-head">
            <h2>关于</h2>
          </div>
          <p className="me-note">
            必学堂 · 把公开课做成闯关游戏的自学平台。开源项目,欢迎 Star 与反馈。
          </p>
          <div className="settings-about">
            <a
              className="settings-about-link"
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
            >
              <GithubMark />
              <span>GitHub 仓库</span>
              <ExternalLink size={14} className="settings-about-ext" aria-hidden />
            </a>
            <a
              className="settings-about-link"
              href={`${REPO}/issues/new`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Bug size={18} aria-hidden />
              <span>反馈问题 / 提 Issue</span>
              <ExternalLink size={14} className="settings-about-ext" aria-hidden />
            </a>
            <a
              className="settings-about-link"
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Star size={18} aria-hidden />
              <span>喜欢就去点个 Star ⭐</span>
              <ExternalLink size={14} className="settings-about-ext" aria-hidden />
            </a>
          </div>
          <p className="me-note">开源协议 · GPL-3.0-or-later</p>
        </section>

        {/* 退出登录:此前整站没有任何登出入口(用户点名的问题) */}
        <section className="course-card">
          <div className="course-card-head">
            <h2>账号</h2>
          </div>
          <form action={logout}>
            <button className="settings-logout" type="submit">
              <LogOut size={16} aria-hidden /> 退出登录
            </button>
          </form>
          <p className="me-note">退出后本设备的登录状态清除,进度都在云端不受影响。</p>
        </section>
      </div>
    </AppShell>
  );
}
