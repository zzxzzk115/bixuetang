import { AppShell } from "@/components/app/app-shell";
import { AvatarForm } from "@/components/avatar-form";
import { PasswordForm, ProfileForm } from "@/components/settings-forms";
import { UserAvatar } from "@/components/user-avatar";
import { TokenManager } from "@/components/token-manager";
import { listApiTokens } from "@/lib/auth/api-token";
import { requireUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";

export const metadata = { title: "设置" };

export default async function SettingsPage() {
  const user = await requireUser();
  const tokens = listApiTokens(user.id);
  const bootstrap = getGameBootstrap(user);

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
            <ProfileForm displayName={user.displayName ?? ""} />
          </div>
        </section>

        <section className="course-card">
          <div className="course-card-head">
            <h2>头像</h2>
          </div>
          <div className="app-skin">
            <AvatarForm avatar={user.avatar} />
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
            <h2>🧩 浏览器插件 token</h2>
          </div>
          <div className="app-skin">
            <TokenManager tokens={tokens} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
