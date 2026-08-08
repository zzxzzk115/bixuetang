"use client";

import { useActionState } from "react";
import {
  adminChangePassword,
  type AdminFormState,
} from "@/lib/admin/auth-actions";

export function AdminPasswordForm() {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(
    adminChangePassword,
    null,
  );
  const ok = state && "ok" in state;
  return (
    <form action={action} className="admin-auth-form" key={ok ? "done" : "form"}>
      <label>
        <span>当前密码</span>
        <input name="current" type="password" autoComplete="current-password" required />
      </label>
      <label>
        <span>新密码</span>
        <input name="next" type="password" autoComplete="new-password" required />
      </label>
      <label>
        <span>确认新密码</span>
        <input name="next2" type="password" autoComplete="new-password" required />
      </label>
      {state && "error" in state ? (
        <p className="admin-auth-error">{state.error}</p>
      ) : null}
      {ok ? <p className="admin-auth-ok">密码已更新。</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "提交中…" : "修改密码"}
      </button>
    </form>
  );
}
