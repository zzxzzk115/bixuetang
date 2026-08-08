import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { AdminNav } from "@/components/app/admin-nav";
import { isAdmin } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";

// 管理端外壳:套主 App 壳(同 UI 风格),内嵌一层管理端导航。
// 权限在这一层统一把关——非管理员整个 /admin/* 直接 404,不暴露任何入口。
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!isAdmin(user)) notFound();
  const bootstrap = getGameBootstrap(user);
  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page admin-root">
        <header className="admin-head">
          <h1>管理端</h1>
          <p className="me-note">站点运营与内容维护。仅管理员可见。</p>
        </header>
        <AdminNav />
        {children}
      </div>
    </AppShell>
  );
}
