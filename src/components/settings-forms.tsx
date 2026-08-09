"use client";

import { useActionState, useState, useTransition } from "react";
import {
  changePassword,
  resendEmailVerification,
  updateEmail,
  updateProfile,
  type SettingsFormState,
} from "@/lib/auth/settings-actions";

const inputCls =
  "mt-1 w-full rounded border border-edge bg-background px-3 py-2 text-sm outline-none focus:border-gold";
const btnCls =
  "rounded border border-gold px-4 py-2 text-sm font-bold text-gold transition-colors hover:bg-gold hover:text-background disabled:opacity-50";

function Feedback({ state }: { state: SettingsFormState }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm text-hp">{state.error}</p>;
  if (state.success) return <p className="text-sm text-xp">✓ {state.success}</p>;
  return null;
}

export function ProfileForm({
  displayName,
  biliNickname,
  username,
}: {
  displayName: string;
  biliNickname?: string | null;
  username?: string;
}) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(
    updateProfile,
    null,
  );
  // 受控：为了「用 bilibili 昵称」一点就能填进去
  const [name, setName] = useState(displayName);

  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        <span className="text-muted">
          角色名（留空则显示{biliNickname ? "用户名" : `用户名 ${username ?? ""}`}）
        </span>
        <input
          name="displayName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          className={inputCls}
        />
      </label>
      {biliNickname && biliNickname !== name && (
        <button
          type="button"
          onClick={() => setName(biliNickname)}
          className="app-btn-plain"
        >
          用 bilibili 昵称「{biliNickname}」
        </button>
      )}
      <div className="flex items-center gap-3">
        <button disabled={pending} className={btnCls}>
          {pending ? "保存中……" : "保存"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function EmailForm({
  email,
  verified,
}: {
  email: string | null;
  verified: boolean;
}) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(
    updateEmail,
    null,
  );
  const [value, setValue] = useState(email ?? "");
  const [resendState, setResendState] = useState<SettingsFormState>(null);
  const [resending, startResend] = useTransition();

  // 绑了但没验证:提示 + 重发按钮
  const showUnverified = !!email && !verified;

  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        <span className="text-muted">
          找回邮箱（绑定后需点邮件里的链接验证，验证过才能用于找回密码；留空则解绑）
        </span>
        <input
          name="email"
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          className={inputCls}
        />
      </label>
      {email && (
        <p className="text-sm">
          {verified ? (
            <span className="text-xp">✓ 已验证</span>
          ) : (
            <span className="text-hp">● 未验证——去邮箱点确认链接完成绑定</span>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={btnCls}>
          {pending ? "保存中……" : email ? "更新邮箱" : "绑定邮箱"}
        </button>
        {showUnverified && (
          <button
            type="button"
            disabled={resending}
            className="app-btn-plain"
            onClick={() =>
              startResend(async () => setResendState(await resendEmailVerification()))
            }
          >
            {resending ? "发送中……" : "重新发送验证邮件"}
          </button>
        )}
        <Feedback state={state} />
        <Feedback state={resendState} />
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(
    changePassword,
    null,
  );
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        <span className="text-muted">当前密码</span>
        <input
          name="current"
          type="password"
          required
          autoComplete="current-password"
          className={inputCls}
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted">新密码（至少 8 位）</span>
        <input
          name="next"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputCls}
        />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={btnCls}>
          {pending ? "修改中……" : "修改密码"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
