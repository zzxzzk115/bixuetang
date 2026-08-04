"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { login, register, type AuthFormState } from "@/lib/auth/actions";

// 账号密码登录。扫码是主路径，这个是备选——所以不做成独立卡片，
// 直接嵌在登录页的分隔线下面，跟扫码区共用一个容器。
//
// 注册入口不在这里：新账号统一走扫码开号（见 bili-auth.tsx），
// 那条路径会顺便绑好 bilibili，不然开出来的号看不了视频。

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const action = mode === "login" ? login : register;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="auth-pwd">
      <label className="bili-signup-field">
        <span>用户名</span>
        <input
          name="username"
          required
          autoComplete="username"
          pattern="[a-z0-9_]{3,32}"
          title="3–32 位小写字母、数字或下划线"
          placeholder={mode === "register" ? "3–32 位小写字母、数字或下划线" : ""}
        />
      </label>

      {mode === "register" && (
        <label className="bili-signup-field">
          <span>昵称</span>
          <input name="displayName" maxLength={32} placeholder="可留空" />
        </label>
      )}

      <label className="bili-signup-field">
        <span>密码</span>
        <input
          name="password"
          type="password"
          required
          minLength={mode === "register" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder={mode === "register" ? "至少 8 位" : ""}
        />
      </label>

      <button className="app-btn-primary" disabled={pending}>
        {pending ? (
          <>
            <Loader2 size={15} className="spin" aria-hidden />
            {mode === "login" ? "登录中…" : "创建中…"}
          </>
        ) : mode === "login" ? (
          "登录"
        ) : (
          "创建账号"
        )}
      </button>

      {state?.error && <p className="bili-bind-error">{state.error}</p>}
    </form>
  );
}
