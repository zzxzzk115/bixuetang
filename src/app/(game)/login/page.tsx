import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Shield } from "lucide-react";
import { BiliAuth } from "@/components/app/bili-auth";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = { title: "登录" };

// 登录页(App 风格):先让用户选一种方式,每屏只显示那一种——避免扫码块 + 表单
// 堆在一页太高,在不滚动的壳里点不到底部按钮。
//   · 默认 = bilibili 扫码(主路径,一张码管登录 + 开号 + 播放/字幕/互动)
//   · ?pwd=1 = 账号密码登录     · ?reg=1 = 注册新账号
// 账号密码/注册屏不再渲染扫码块,bilibili 之后随时可在设置里补绑。
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ pwd?: string; reg?: string; reset?: string }>;
}) {
  if (await getCurrentUser()) redirect("/play");
  const { pwd, reg, reset } = await searchParams;
  const mode = reg ? "reg" : pwd ? "pwd" : "bili";

  return (
    <div className="auth-page">
      <div className="auth-card">
        <span className="auth-brand">
          <Shield size={26} strokeWidth={2.4} />
          必学堂
        </span>

        {mode === "bili" ? (
          <>
            <h1>扫码进入</h1>
            <p className="auth-lead">
              用 bilibili 账号扫码即可登录;没有账号会引导你开一个,
              昵称取自 bilibili(之后可改)。
            </p>
            {reset ? (
              <p className="auth-reset-ok">密码已重置,请用新密码登录。</p>
            ) : null}
            <BiliAuth />
            <div className="auth-alt">
              <span className="auth-divider">或</span>
              <Link href="/login?pwd=1" className="auth-alt-link">
                用账号密码登录
              </Link>
              <Link href="/login?reg=1" className="auth-alt-link">
                不用 bilibili,直接注册
              </Link>
            </div>
            <p className="auth-note">
              扫码只用于登录与播放,凭据保存在本站服务端,随时可在设置里解绑。
            </p>
          </>
        ) : mode === "reg" ? (
          <>
            <h1>注册新账号</h1>
            <p className="auth-lead">
              用户名 + 密码即可开号,直接开始学习。
            </p>
            <AuthForm mode="register" />
            <p className="auth-note">
              绑定 bilibili(设置页)后解锁高清晰度、CC 字幕与点赞投币等互动。
            </p>
            <div className="auth-alt">
              <Link href="/login?pwd=1" className="auth-alt-link">
                已有账号?用账号密码登录
              </Link>
              <Link href="/login" className="auth-alt-link">
                <ArrowLeft size={13} aria-hidden /> 改用 bilibili 扫码
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1>账号密码登录</h1>
            {reset ? (
              <p className="auth-reset-ok">密码已重置,请用新密码登录。</p>
            ) : null}
            <AuthForm mode="login" />
            <div className="auth-alt">
              <Link href="/forgot-password" className="auth-alt-link">
                忘记密码?
              </Link>
              <Link href="/login?reg=1" className="auth-alt-link">
                没有账号?注册一个
              </Link>
              <Link href="/login" className="auth-alt-link">
                <ArrowLeft size={13} aria-hidden /> 改用 bilibili 扫码
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
