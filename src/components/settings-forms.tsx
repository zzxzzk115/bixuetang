"use client";

import { useActionState, useState } from "react";
import {
  changePassword,
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
