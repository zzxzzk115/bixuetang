import Link from "next/link";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { BiliAuth } from "@/components/app/bili-auth";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = { title: "登录" };

// 登录页（App 风格）：扫码 bilibili 是主路径——一张码同时管登录与开号，
// 而且登录后播放/字幕/互动全部可用。账号密码登录与独立注册作为备选：
// 不想（或没法）扫码的用户也能开号，bilibili 之后随时可在设置里补绑。
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ pwd?: string; reg?: string }>;
}) {
  if (await getCurrentUser()) redirect("/play");
  const { pwd, reg } = await searchParams;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <span className="auth-brand">
          <Shield size={26} strokeWidth={2.4} />
          必学堂
        </span>
        <h1>扫码进入</h1>
        <p className="auth-lead">
          用 bilibili 账号扫码即可登录；没有账号会引导你开一个，
          昵称取自 bilibili（之后可改）。
        </p>

        <BiliAuth />

        <div className="auth-alt">
          {reg ? (
            <>
              <span className="auth-divider">注册新账号</span>
              <AuthForm mode="register" />
              <p className="auth-note">
                注册后可直接学习；绑定 bilibili（设置页）后解锁高清晰度、
                CC 字幕与点赞投币等互动。
              </p>
              <Link href="/login?pwd=1" className="auth-alt-link">
                已有账号？用账号密码登录
              </Link>
            </>
          ) : pwd ? (
            <>
              <span className="auth-divider">或用账号密码</span>
              <AuthForm mode="login" />
              <Link href="/login?reg=1" className="auth-alt-link">
                没有账号？注册一个
              </Link>
            </>
          ) : (
            <>
              <Link href="/login?pwd=1" className="auth-alt-link">
                用账号密码登录
              </Link>
              <Link href="/login?reg=1" className="auth-alt-link">
                不用 bilibili，直接注册
              </Link>
            </>
          )}
        </div>

        <p className="auth-note">
          扫码只用于登录与播放，凭据保存在本站服务端，随时可在设置里解绑。
        </p>
      </div>
    </div>
  );
}
