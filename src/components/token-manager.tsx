"use client";

import { useActionState, useState, useTransition } from "react";
import {
  generateToken,
  revokeToken,
  type TokenFormState,
} from "@/lib/auth/token-actions";

export interface TokenRow {
  tokenHash: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
}

function fmtDate(ms: number | null): string {
  if (!ms) return "从未使用";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TokenManager({ tokens }: { tokens: TokenRow[] }) {
  const [state, action, pending] = useActionState<TokenFormState, FormData>(
    generateToken,
    null,
  );
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  const fresh = state && "token" in state ? state : null;

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted">
        装上浏览器插件后，在 bilibili / YouTube
        原站看课（登录态、原生清晰度都在）也能自动同步进度。插件代码在仓库
        <code className="mx-1 rounded bg-panel-hover px-1">extension/</code>
        目录，加载方式见其中的 README。
        <br />
        token 明文只在生成时显示一次，请立刻复制到插件设置里。
      </p>

      <form action={action} className="flex gap-2">
        <input
          name="label"
          placeholder="用途备注，如「家里的 Chrome」"
          maxLength={40}
          className="flex-1 rounded border border-edge bg-background px-3 py-2 text-sm outline-none focus:border-gold"
        />
        <button
          disabled={pending}
          className="shrink-0 rounded border border-gold px-4 py-2 text-sm font-bold text-gold transition-colors hover:bg-gold hover:text-background disabled:opacity-50"
        >
          {pending ? "生成中…" : "生成 token"}
        </button>
      </form>

      {state && "error" in state && (
        <p className="text-sm text-hp">{state.error}</p>
      )}

      {fresh && (
        <div className="rounded border border-gold bg-amber-100/50 p-3 dark:bg-amber-950/30">
          <p className="text-xs text-muted">
            「{fresh.label}」的 token（只显示这一次）：
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded bg-background px-2 py-1.5 font-mono text-xs">
              {fresh.token}
            </code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(fresh.token);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="shrink-0 rounded border border-edge px-2.5 py-1.5 text-xs hover:border-gold hover:text-gold"
            >
              {copied ? "✓ 已复制" : "复制"}
            </button>
          </div>
        </div>
      )}

      {tokens.length > 0 && (
        <ul className="space-y-1.5">
          {tokens.map((t) => (
            <li
              key={t.tokenHash}
              className="flex items-center justify-between gap-2 rounded border border-edge bg-panel-hover px-3 py-2 text-sm"
            >
              <span>
                {t.label}
                <span className="ml-2 text-xs text-muted">
                  最近使用 {fmtDate(t.lastUsedAt)}
                </span>
              </span>
              <button
                onClick={() =>
                  startTransition(async () => void (await revokeToken(t.tokenHash)))
                }
                className="shrink-0 text-xs text-muted hover:text-hp"
              >
                撤销
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
