import { AdminPasswordForm } from "@/components/admin/admin-password-form";
import { requireAdmin } from "@/lib/admin/session";

export const metadata = { title: "设置" };
export const dynamic = "force-dynamic";

export default async function ConsoleSettings() {
  const admin = await requireAdmin();
  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <h1>设置</h1>
        <p className="admin-muted">管理员账户 @{admin.username}</p>
      </header>
      <section className="admin-card" style={{ maxWidth: 420 }}>
        <h2>修改密码</h2>
        {admin.mustChangePassword ? (
          <p className="admin-muted">
            你还在用默认密码，出于安全请立即修改。
          </p>
        ) : null}
        <AdminPasswordForm />
      </section>
    </div>
  );
}
