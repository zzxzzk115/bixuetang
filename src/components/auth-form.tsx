"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, register, type AuthFormState } from "@/lib/auth/actions";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const action = mode === "login" ? login : register;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    action,
    null,
  );

  return (
    <div className="mx-auto mt-8 max-w-sm rounded-lg border border-edge bg-panel p-6">
      <h1 className="text-center text-xl font-bold">
        {mode === "login" ? "回到冒险" : "创建角色"}
      </h1>
      <form action={formAction} className="mt-5 space-y-4">
        <label className="block text-sm">
          <span className="text-muted">用户名</span>
          <input
            name="username"
            required
            autoComplete="username"
            pattern="[a-z0-9_]{3,32}"
            title="3–32 位小写字母、数字或下划线"
            className="mt-1 w-full rounded border border-edge bg-background px-3 py-2 outline-none focus:border-gold"
          />
        </label>
        {mode === "register" && (
          <label className="block text-sm">
            <span className="text-muted">角色名（可选，展示用）</span>
            <input
              name="displayName"
              maxLength={32}
              className="mt-1 w-full rounded border border-edge bg-background px-3 py-2 outline-none focus:border-gold"
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="text-muted">密码{mode === "register" ? "（至少 8 位）" : ""}</span>
          <input
            name="password"
            type="password"
            required
            minLength={mode === "register" ? 8 : undefined}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            className="mt-1 w-full rounded border border-edge bg-background px-3 py-2 outline-none focus:border-gold"
          />
        </label>
        {state?.error && <p className="text-sm text-hp">{state.error}</p>}
        <button
          disabled={pending}
          className="w-full rounded border border-gold py-2 font-bold text-gold transition-colors hover:bg-gold hover:text-background disabled:opacity-50"
        >
          {pending ? "……" : mode === "login" ? "登录" : "开始冒险"}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-muted">
        {mode === "login" ? (
          <>
            还没有角色？{" "}
            <Link href="/register" className="text-gold hover:underline">
              创建一个
            </Link>
          </>
        ) : (
          <>
            已有角色？{" "}
            <Link href="/login" className="text-gold hover:underline">
              直接登录
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
