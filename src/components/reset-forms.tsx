"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  requestPasswordReset,
  resetPassword,
  type ResetRequestState,
  type ResetState,
} from "@/lib/auth/reset-actions";

// 忘记密码:输邮箱申请重置链接。无论邮箱是否注册都回同样的成功文案(防枚举)。
export function ForgotForm() {
  const [state, formAction, pending] = useActionState<
    ResetRequestState,
    FormData
  >(requestPasswordReset, null);

  if (state?.done) {
    return (
      <div className="auth-pwd auth-reset-done">
        <CheckCircle2 size={30} aria-hidden />
        <p>
          如果该邮箱已绑定账号,重置链接已发出,1 小时内有效。
          没收到就检查垃圾箱,或稍后再试。
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="auth-pwd">
      <label className="bili-signup-field">
        <span>注册邮箱</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          placeholder="you@example.com"
        />
      </label>
      <button className="app-btn-primary" disabled={pending}>
        {pending ? (
          <>
            <Loader2 size={15} className="spin" aria-hidden />
            发送中…
          </>
        ) : (
          "发送重置链接"
        )}
      </button>
      {state?.error && <p className="bili-bind-error">{state.error}</p>}
    </form>
  );
}

// 凭链接里的 token 设置新密码。成功后 server action 直接跳登录页。
export function ResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(
    resetPassword,
    null,
  );
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const mismatch = pwd2.length > 0 && pwd !== pwd2;

  return (
    <form action={formAction} className="auth-pwd">
      <input type="hidden" name="token" value={token} />
      <label className="bili-signup-field">
        <span>新密码</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="至少 8 位,字母数字混合"
          onChange={(e) => setPwd(e.target.value)}
        />
      </label>
      <label className="bili-signup-field">
        <span>确认新密码</span>
        <input
          name="password2"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="再输一遍"
          onChange={(e) => setPwd2(e.target.value)}
        />
      </label>
      {mismatch && <p className="bili-bind-error">两次输入的密码不一致</p>}
      <button className="app-btn-primary" disabled={pending || mismatch}>
        {pending ? (
          <>
            <Loader2 size={15} className="spin" aria-hidden />
            重置中…
          </>
        ) : (
          "重置密码"
        )}
      </button>
      {state?.error && <p className="bili-bind-error">{state.error}</p>}
    </form>
  );
}
