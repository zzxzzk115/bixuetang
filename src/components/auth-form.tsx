"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { login, register, type AuthFormState } from "@/lib/auth/actions";

// 账号密码登录/注册。扫码是主路径，这个是备选——所以不做成独立卡片，
// 直接嵌在登录页的分隔线下面，跟扫码区共用一个容器。
// 注册出来的号没绑 bilibili 也能学习（标清播放），设置页随时可补绑。
// 注册带三道闸:自托管 SVG 验证码 / 密码强度(字母数字混合起步)/
// 二次确认输入;最终校验都在服务端,前端只是提前给反馈。

/** 与服务端 passwordStrength 同口径的前端预估(仅提示用) */
function strengthOf(pwd: string): 0 | 1 | 2 {
  if (pwd.length < 8) return 0;
  const classes =
    Number(/[a-z]/.test(pwd)) +
    Number(/[A-Z]/.test(pwd)) +
    Number(/\d/.test(pwd)) +
    Number(/[^a-zA-Z0-9]/.test(pwd));
  if (classes >= 3 && pwd.length >= 10) return 2;
  if (classes >= 2) return 1;
  return 0;
}

const STRENGTH_LABEL = ["弱", "中", "强"] as const;

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const action = mode === "login" ? login : register;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    action,
    null,
  );
  // 受控字段:React 19 的 <form action> 在动作结束后会自动 reset 表单——包括出错时。
  // 若字段不受控,验证码错一次就把用户名/邮箱/密码全清了。受控值存 state 不受 reset
  // 影响,报错后原样保留(只有验证码答案故意留空,因为已换了新码)。
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [captcha, setCaptcha] = useState<{ svg: string; token: string } | null>(
    null,
  );

  const refreshCaptcha = useCallback(() => {
    fetch("/api/captcha")
      .then((r) => r.json())
      .then(setCaptcha)
      .catch(() => setCaptcha(null));
  }, []);

  useEffect(() => {
    if (mode === "register") refreshCaptcha();
  }, [mode, refreshCaptcha]);

  // 提交失败(多半是验证码错/过期)自动换一张
  useEffect(() => {
    if (mode === "register" && state?.error) refreshCaptcha();
  }, [mode, state, refreshCaptcha]);

  const strength = strengthOf(pwd);
  const mismatch = pwd2.length > 0 && pwd !== pwd2;

  return (
    <form action={formAction} className="auth-pwd">
      <label className="bili-signup-field">
        <span>{mode === "login" ? "用户名 / 邮箱" : "用户名"}</span>
        <input
          name="username"
          required
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          // 登录允许用邮箱,故不加用户名字符限制;注册仍限用户名格式
          pattern={mode === "register" ? "[a-z0-9_]{3,32}" : undefined}
          title={
            mode === "register" ? "3–32 位小写字母、数字或下划线" : undefined
          }
          placeholder={
            mode === "register"
              ? "3–32 位小写字母、数字或下划线"
              : "用户名或注册邮箱"
          }
        />
      </label>

      {mode === "register" && (
        <label className="bili-signup-field">
          <span>昵称</span>
          <input
            name="displayName"
            maxLength={32}
            placeholder="可留空"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
      )}

      {mode === "register" && (
        <label className="bili-signup-field">
          <span>邮箱</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            placeholder="可留空,用于日后找回密码"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
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
          placeholder={mode === "register" ? "至少 8 位,字母数字混合" : ""}
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
        />
      </label>

      {mode === "register" && (
        <>
          {pwd.length > 0 && (
            <div className={`auth-strength s${strength}`}>
              <i />
              <i />
              <i />
              <small>
                强度:{STRENGTH_LABEL[strength]}
                {strength === 0 ? "(需字母数字混合且 ≥8 位)" : ""}
              </small>
            </div>
          )}
          <label className="bili-signup-field">
            <span>确认密码</span>
            <input
              name="password2"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="再输一遍"
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
            />
          </label>
          {mismatch && <p className="bili-bind-error">两次输入的密码不一致</p>}

          <div className="auth-captcha">
            <label className="bili-signup-field">
              <span>验证码</span>
              <input
                name="captchaAnswer"
                required
                maxLength={4}
                autoComplete="off"
                placeholder="输入右图字符"
              />
            </label>
            <input
              type="hidden"
              name="captchaToken"
              value={captcha?.token ?? ""}
            />
            <button
              type="button"
              className="auth-captcha-img"
              onClick={refreshCaptcha}
              title="看不清?换一张"
            >
              {captcha ? (
                <span dangerouslySetInnerHTML={{ __html: captcha.svg }} />
              ) : (
                <Loader2 size={16} className="spin" aria-hidden />
              )}
              <RefreshCw size={13} aria-hidden />
            </button>
          </div>
        </>
      )}

      <button
        className="app-btn-primary"
        disabled={pending || (mode === "register" && (strength < 1 || mismatch))}
      >
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
