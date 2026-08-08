"use client";

import { useActionState } from "react";
import { adminLogin, type AdminFormState } from "@/lib/admin/auth-actions";

export function AdminLoginForm() {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(
    adminLogin,
    null,
  );
  return (
    <form action={action} className="admin-auth-form">
      <label>
        <span>用户名</span>
        <input name="username" autoComplete="username" required autoFocus />
      </label>
      <label>
        <span>密码</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state && "error" in state ? (
        <p className="admin-auth-error">{state.error}</p>
      ) : null}
      <button type="submit" disabled={pending}>
        {pending ? "登录中…" : "登录管理端"}
      </button>
    </form>
  );
}
