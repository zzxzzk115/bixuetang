import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

// 管理端受保护区:未登录 → requireAdmin 跳 /console/login。登录页不在本组内。
export default async function ConsolePanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();
  return (
    <AdminShell
      username={admin.username}
      mustChange={admin.mustChangePassword}
    >
      {children}
    </AdminShell>
  );
}
