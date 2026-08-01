import { PasswordForm, ProfileForm } from "@/components/settings-forms";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "设置" };

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">设置</h1>

      <section className="rounded-lg border border-edge bg-panel p-5">
        <h2 className="mb-3 font-bold">角色资料</h2>
        <p className="mb-3 text-xs text-muted">用户名：{user.username}</p>
        <ProfileForm displayName={user.displayName ?? ""} />
      </section>

      <section className="rounded-lg border border-edge bg-panel p-5">
        <h2 className="mb-3 font-bold">修改密码</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
