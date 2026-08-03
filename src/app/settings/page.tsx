import { AvatarForm } from "@/components/avatar-form";
import { PasswordForm, ProfileForm } from "@/components/settings-forms";
import { UserAvatar } from "@/components/user-avatar";
import { TokenManager } from "@/components/token-manager";
import { listApiTokens } from "@/lib/auth/api-token";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "设置" };

export default async function SettingsPage() {
  const user = await requireUser();
  const tokens = listApiTokens(user.id);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">设置</h1>

      <section className="rounded-lg border border-edge bg-panel p-5">
        <h2 className="mb-3 font-bold">角色资料</h2>
        <p className="mb-3 text-xs text-muted">用户名：{user.username}</p>
        <ProfileForm displayName={user.displayName ?? ""} />
      </section>

      <section className="rounded-lg border border-edge bg-panel p-5">
        <div className="mb-3 flex items-center gap-3">
          <UserAvatar
            userId={user.id}
            avatar={user.avatar}
            name={user.displayName || user.username}
            size={48}
          />
          <h2 className="font-bold">头像</h2>
        </div>
        <AvatarForm avatar={user.avatar} />
      </section>

      <section className="rounded-lg border border-edge bg-panel p-5">
        <h2 className="mb-3 font-bold">修改密码</h2>
        <PasswordForm />
      </section>

      <section className="rounded-lg border border-edge bg-panel p-5">
        <h2 className="mb-3 font-bold">🧩 浏览器插件 token</h2>
        <TokenManager tokens={tokens} />
      </section>
    </div>
  );
}
