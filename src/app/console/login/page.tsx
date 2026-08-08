import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { getCurrentAdmin } from "@/lib/admin/session";

export const metadata = { title: "登录" };
export const dynamic = "force-dynamic";

// 管理端登录(公开,不在 (panel) 守卫下)。已登录直接进控制台。
export default async function AdminLoginPage() {
  if (await getCurrentAdmin()) redirect("/console");
  return (
    <div className="admin-auth-page">
      <div className="admin-auth-card">
        <span className="admin-auth-brand">
          <ShieldCheck size={24} strokeWidth={2.4} />
          必学堂管理端
        </span>
        <h1>运营后台登录</h1>
        <p className="admin-auth-lead">
          仅站点运营人员使用。默认账户 <code>admin</code>，首次登录后请立即修改密码。
        </p>
        <AdminLoginForm />
      </div>
    </div>
  );
}
