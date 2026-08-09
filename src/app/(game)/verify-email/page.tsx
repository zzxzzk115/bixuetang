import Link from "next/link";
import { Shield } from "lucide-react";
import { VerifyEmailForm } from "@/components/reset-forms";

export const metadata = { title: "验证邮箱" };

// 邮件链接落地页。token 的有效性在点「确认」时由 server action 判定,
// 这里只把 token 交给按钮(GET 不即验,避免邮件客户端预取误消耗)。
export default async function VerifyEmailPage({
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
        <h1>验证邮箱</h1>
        {token ? (
          <>
            <p className="auth-lead">确认这个邮箱归你所有,之后即可用它找回密码。</p>
            <VerifyEmailForm token={token} />
          </>
        ) : (
          <>
            <p className="auth-lead">链接不完整或已失效,请回设置里重新发送验证邮件。</p>
            <div className="auth-alt">
              <Link href="/settings" className="auth-alt-link">
                去设置
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
