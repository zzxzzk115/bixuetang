import Link from "next/link";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { BiliAuth } from "@/components/app/bili-auth";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = { title: "登录" };

// 登录页（App 风格）：扫码 B 站是主路径——一张码同时管登录与开号，
// 而且登录后播放/字幕/互动全部可用。账号密码作为备选留在下面。
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ pwd?: string }>;
}) {
  if (await getCurrentUser()) redirect("/play");
  const { pwd } = await searchParams;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <span className="auth-brand">
          <Shield size={26} strokeWidth={2.4} />
          学者公会
        </span>
        <h1>扫码进入</h1>
        <p className="auth-lead">
          用 B 站账号扫码即可登录；没有公会账号会自动开一个，
          昵称取自 B 站（之后可改）。
        </p>

        <BiliAuth />

        <div className="auth-alt">
          {pwd ? (
            <>
              <span className="auth-divider">或用账号密码</span>
              <AuthForm mode="login" />
            </>
          ) : (
            <Link href="/login?pwd=1" className="auth-alt-link">
              用账号密码登录
            </Link>
          )}
        </div>

        <p className="auth-note">
          扫码只用于登录与播放，凭据保存在本站服务端，随时可在设置里解绑。
        </p>
      </div>
    </div>
  );
}
