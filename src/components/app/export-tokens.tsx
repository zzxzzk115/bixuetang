"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import {
  createApiToken,
  revokeApiToken,
  type ApiTokenView,
} from "@/lib/export/token-actions";

// 个人 API 令牌管理:新建(明文只显示这一次)+ 列表 + 撤销。
// 令牌用于 GET /api/v1/export(只读拉自己的数据)。

function fmtDate(ms: number): string {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export function ExportTokens({ initial }: { initial: ApiTokenView[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<"token" | "curl" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const curl =
    typeof window !== "undefined"
      ? `curl -H "Authorization: Bearer ${fresh ?? "bxt_你的令牌"}" ${window.location.origin}/api/v1/export`
      : "";

  const copy = (text: string, which: "token" | "curl") => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const create = () => {
    setError(null);
    startTransition(async () => {
      const r = await createApiToken(label);
      if (!r.ok) return setError(r.error ?? "创建失败");
      setFresh(r.token!);
      setLabel("");
      router.refresh();
    });
  };

  const revoke = (id: number) => {
    startTransition(async () => {
      await revokeApiToken(id);
      router.refresh();
    });
  };

  return (
    <div className="tokens">
      {fresh && (
        <div className="tokens-fresh">
          <p className="tokens-fresh-note">
            <Check size={14} aria-hidden /> 令牌已生成，只显示这一次，请立刻复制保存：
          </p>
          <div className="tokens-fresh-row">
            <code>{fresh}</code>
            <button onClick={() => copy(fresh, "token")}>
              {copied === "token" ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
          <div className="tokens-curl">
            <code>{curl}</code>
            <button onClick={() => copy(curl, "curl")}>
              {copied === "curl" ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
        </div>
      )}

      <div className="tokens-create">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="令牌用途，如「n8n 同步」"
          maxLength={40}
        />
        <button
          type="button"
          className="app-btn-primary"
          onClick={create}
          disabled={pending}
        >
          <Plus size={16} aria-hidden /> 新建令牌
        </button>
      </div>
      {error && <p className="tokens-error">{error}</p>}

      {initial.length > 0 ? (
        <ul className="tokens-list">
          {initial.map((t) => (
            <li key={t.id}>
              <KeyRound size={16} aria-hidden className="tokens-list-icon" />
              <span className="tokens-list-body">
                <b>{t.label}</b>
                <small>
                  建于 {fmtDate(t.createdAt)} ·{" "}
                  {t.lastUsedAt ? `最近用于 ${fmtDate(t.lastUsedAt)}` : "尚未使用"}
                </small>
              </span>
              <button
                className="tokens-revoke"
                onClick={() => revoke(t.id)}
                disabled={pending}
                aria-label="撤销"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="me-note">还没有令牌。新建后可用它只读拉取自己的笔记/术语 JSON。</p>
      )}
    </div>
  );
}
