"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, RefreshCw, Unlink } from "lucide-react";
import {
  connectNotion,
  connectReadwise,
  disconnectIntegration,
  syncIntegration,
  type IntegrationStatus,
  type Provider,
} from "@/lib/export/integration-actions";

// Readwise / Notion 直连:粘贴自己的令牌即连,一键把笔记推过去。
// 令牌不回传前端;这里只按「是否已连」渲染。

function fmtDate(ms: number): string {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
}

const META: Record<Provider, { name: string; hint: React.ReactNode; needsDb: boolean }> = {
  readwise: {
    name: "Readwise",
    hint: (
      <>
        在 <code>readwise.io/access_token</code> 拿到令牌，粘贴即连。
      </>
    ),
    needsDb: false,
  },
  notion: {
    name: "Notion",
    hint: (
      <>
        新建一个 Notion 内部集成拿到 <code>secret_…</code> 令牌，把目标数据库分享给它，
        再填数据库 ID。
      </>
    ),
    needsDb: true,
  },
};

function ProviderRow({ status }: { status: IntegrationStatus }) {
  const router = useRouter();
  const meta = META[status.provider];
  const [token, setToken] = useState("");
  const [dbId, setDbId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const connect = () => {
    setErr(null);
    setMsg(null);
    start(async () => {
      const r =
        status.provider === "readwise"
          ? await connectReadwise(token)
          : await connectNotion(token, dbId);
      if (!r.ok) return setErr(r.error ?? "连接失败");
      setToken("");
      setDbId("");
      router.refresh();
    });
  };

  const sync = () => {
    setErr(null);
    setMsg(null);
    start(async () => {
      const r = await syncIntegration(status.provider);
      if (!r.ok) return setErr(r.error ?? "同步失败");
      setMsg(`已推送 ${r.count} 条笔记`);
      router.refresh();
    });
  };

  const disconnect = () => {
    start(async () => {
      await disconnectIntegration(status.provider);
      router.refresh();
    });
  };

  return (
    <div className="integration">
      <div className="integration-head">
        <b>{meta.name}</b>
        {status.connected && (
          <span className="integration-badge">
            <Check size={12} aria-hidden /> 已连接
          </span>
        )}
      </div>

      {status.connected ? (
        <>
          <small className="integration-sub">
            {status.lastSyncedAt
              ? `上次同步 ${fmtDate(status.lastSyncedAt)}`
              : "尚未同步"}
          </small>
          <div className="integration-actions">
            <button className="app-btn-primary" onClick={sync} disabled={pending}>
              <RefreshCw size={15} aria-hidden /> {pending ? "同步中…" : "同步笔记"}
            </button>
            <button className="integration-unlink" onClick={disconnect} disabled={pending}>
              <Unlink size={15} aria-hidden /> 断开
            </button>
          </div>
        </>
      ) : (
        <>
          <small className="integration-sub">{meta.hint}</small>
          <div className="integration-form">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={`${meta.name} 令牌`}
              type="password"
            />
            {meta.needsDb && (
              <input
                value={dbId}
                onChange={(e) => setDbId(e.target.value)}
                placeholder="目标数据库 ID"
              />
            )}
            <button className="app-btn-primary" onClick={connect} disabled={pending}>
              <Link2 size={15} aria-hidden /> 连接
            </button>
          </div>
        </>
      )}
      {msg && <p className="integration-ok">{msg}</p>}
      {err && <p className="tokens-error">{err}</p>}
    </div>
  );
}

export function ExportIntegrations({ statuses }: { statuses: IntegrationStatus[] }) {
  return (
    <div className="integrations">
      {statuses.map((s) => (
        <ProviderRow key={s.provider} status={s} />
      ))}
    </div>
  );
}
