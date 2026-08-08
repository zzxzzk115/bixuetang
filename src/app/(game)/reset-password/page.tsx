import Link from "next/link";
import { Shield } from "lucide-react";
import { ResetForm } from "@/components/reset-forms";

export const metadata = { title: "重置密码" };

// 凭邮件链接里的 token 设新密码。token 的有效性在提交时由 server action 判定,
// 这里只负责把 token 交给表单;缺 token 直接引导去重新申请。
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <span className="auth-brand">
          <Shield size={26} strokeWidth={2.4} />
          必学堂
        </span>
        <h1>重置密码</h1>
        {token ? (
          <>
            <p className="auth-lead">为你的账号设置一个新密码。</p>
            <ResetForm token={token} />
          </>
        ) : (
          <>
            <p className="auth-lead">链接不完整或已失效,请重新申请重置。</p>
            <div className="auth-alt">
              <Link href="/forgot-password" className="auth-alt-link">
                重新申请重置链接
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
