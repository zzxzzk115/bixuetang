"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, QrCode } from "lucide-react";
import { pollBiliAuth, startBiliAuth } from "@/lib/bili/auth-actions";
import { qrMatrix } from "@/lib/qr/encode";

// 扫码登录/注册：一个二维码搞定「登录既有账号」与「首次开号」。

function Qr({ text }: { text: string }) {
  const matrix = qrMatrix(text);
  const n = matrix.length;
  const quiet = 2;
  const total = n + quiet * 2;
  let path = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return (
    <svg
      className="bili-qr"
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="B 站登录二维码"
    >
      <rect width={total} height={total} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

export function BiliAuth() {
  const router = useRouter();
  const [qr, setQr] = useState<{ url: string; key: string; buvid?: string } | null>(
    null,
  );
  const [status, setStatus] = useState<
    "idle" | "loading" | "waiting" | "scanned" | "expired" | "ok"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);
  useEffect(() => () => stopPolling(), [stopPolling]);

  const start = useCallback(async () => {
    setError(null);
    setNote(null);
    setStatus("loading");
    const r = await startBiliAuth();
    if (!r.ok || !r.url || !r.key) {
      setStatus("idle");
      setError(r.error ?? "二维码申请失败");
      return;
    }
    setQr({ url: r.url, key: r.key, buvid: r.buvid });
    setStatus("waiting");

    stopPolling();
    const startedAt = Date.now();
    timerRef.current = setInterval(async () => {
      if (Date.now() - startedAt > 185_000) {
        setStatus("expired");
        stopPolling();
        return;
      }
      const poll = await pollBiliAuth(r.key!, r.buvid);
      if (!poll.ok) {
        setError(poll.error ?? "登录失败");
        stopPolling();
        return;
      }
      setNote(poll.note ?? null);
      if (poll.status === "scanned") setStatus("scanned");
      if (poll.status === "expired") {
        setStatus("expired");
        stopPolling();
      }
      if (poll.status === "ok") {
        setStatus("ok");
        stopPolling();
        router.replace("/play");
        router.refresh();
      }
    }, 2500);
  }, [router, stopPolling]);

  // 打开页面就把码亮出来，少一次点击（放进微任务，避开「effect 里同步 setState」）
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    const id = setTimeout(() => void start(), 0);
    return () => clearTimeout(id);
  }, [start]);

  return (
    <div className="bili-auth">
      {qr ? (
        <>
          <Qr text={qr.url} />
          <p className="bili-auth-tip">
            {status === "scanned"
              ? "已扫描，请在手机上确认"
              : status === "ok"
                ? "登录成功，正在进入…"
                : status === "expired"
                  ? "二维码已过期"
                  : "用 B 站手机 App 扫码，即可登录或开号"}
          </p>
          {status === "expired" && (
            <button className="app-btn-primary" onClick={() => void start()}>
              换一张二维码
            </button>
          )}
        </>
      ) : (
        <div className="bili-auth-loading">
          {status === "loading" ? (
            <>
              <Loader2 size={20} className="spin" aria-hidden /> 正在生成二维码…
            </>
          ) : (
            <button className="app-btn-primary" onClick={() => void start()}>
              <QrCode size={16} aria-hidden /> 获取二维码
            </button>
          )}
        </div>
      )}
      {note && <p className="bili-bind-note">{note}</p>}
      {error && <p className="bili-bind-error">{error}</p>}
    </div>
  );
}
