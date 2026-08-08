import Link from "next/link";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { ForgotForm } from "@/components/reset-forms";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = { title: "找回密码" };

// 忘记密码:输邮箱拿重置链接。已登录用户不该走这条,直接回地图。
export default async function ForgotPasswordPage() {
  if (await getCurrentUser()) redirect("/play");

  return (
    <div className="auth-page">
      <div className="auth-card">
        <span className="auth-brand">
          <Shield size={26} strokeWidth={2.4} />
          必学堂
        </span>
        <h1>找回密码</h1>
        <p className="auth-lead">
          输入注册时绑定的邮箱,我们会发一条重置链接给你。
          没绑邮箱的账号:若绑过 bilibili 可直接扫码登录,否则请联系管理员。
        </p>

        <ForgotForm />

        <div className="auth-alt">
          <Link href="/login?pwd=1" className="auth-alt-link">
            想起来了?返回登录
          </Link>
        </div>
      </div>
    </div>
  );
}
