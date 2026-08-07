import { LogOut } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { BiliBind } from "@/components/app/bili-bind";
import { getBiliBinding } from "@/lib/bili/account";
import { AvatarForm } from "@/components/app/avatar-form";
import { PasswordForm, ProfileForm } from "@/components/settings-forms";
import { UserAvatar } from "@/components/user-avatar";
import { logout } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";

export const metadata = { title: "设置" };

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
            <h2>修改密码</h2>
          </div>
          <div className="app-skin">
            <PasswordForm />
          </div>
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
