"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, QrCode, Unlink } from "lucide-react";
import {
  pollBiliLogin,
  startBiliLogin,
  unbindBili,
} from "@/lib/bili/actions";
import { qrMatrix } from "@/lib/qr/encode";

// B 站账号绑定：扫码登录。二维码在浏览器本地画（自写编码器，不依赖外部图床）。

function QrCanvas({ text }: { text: string }) {
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

export interface BiliBindingDto {
  mid: string;
  nickname: string | null;
  avatarUrl: string | null;
}

export function BiliBind({
  binding: initial,
}: {
  binding: BiliBindingDto | null;
}) {
  const [binding, setBinding] = useState(initial);
  /** 绑定前必须同意用户协议 */
  const [agreed, setAgreed] = useState(false);
  const [qr, setQr] = useState<{
    url: string;
    key: string;
    buvid?: string;
  } | null>(null);
  const [status, setStatus] = useState<
    "idle" | "pending" | "scanned" | "expired" | "ok"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const start = async () => {
    setError(null);
    setNote(null);
    setStatus("pending");
    const r = await startBiliLogin();
    if (!r.ok || !r.url || !r.key) {
      setStatus("idle");
      setError(r.error ?? "二维码申请失败");
      return;
    }
    setQr({ url: r.url, key: r.key, buvid: r.buvid });

    stopPolling();
    // 二维码有效期约 180 秒，到点自己收摊，别无限轮询
    const startedAt = Date.now();
    timerRef.current = setInterval(async () => {
      if (Date.now() - startedAt > 185_000) {
        setStatus("expired");
        stopPolling();
        return;
      }
      const poll = await pollBiliLogin(r.key!, r.buvid);
      if (!poll.ok) {
        setError(poll.error ?? "轮询失败");
        stopPolling();
        return;
      }
      // 非预期状态把 B 站原始返回显示出来，免得只能干等
      setNote(poll.note ?? null);
      if (poll.status === "scanned") setStatus("scanned");
      if (poll.status === "expired") {
        setStatus("expired");
        stopPolling();
      }
      if (poll.status === "ok") {
        setStatus("ok");
        setBinding(poll.binding ?? null);
        setQr(null);
        stopPolling();
      }
    }, 2500);
  };

  const unbind = async () => {
    const r = await unbindBili();
    if (r.ok) {
      setBinding(null);
      setStatus("idle");
    }
  };

  if (binding) {
    return (
      <div className="bili-bound">
        {binding.avatarUrl && (
          // B 站头像是外部图源，用原生 img 避开 next/image 的域名白名单
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={binding.avatarUrl}
            alt=""
            className="bili-avatar"
            referrerPolicy="no-referrer"
          />
        )}
        <div className="bili-bound-body">
          <b>
            <CheckCircle2 size={15} aria-hidden /> 已绑定 B 站账号
          </b>
          <small>
            {binding.nickname ?? `UID ${binding.mid}`} · 可播放高清晰度并同步进度
          </small>
        </div>
        <button className="app-btn-plain" onClick={unbind}>
          <Unlink size={15} aria-hidden /> 解绑
        </button>
      </div>
    );
  }

  return (
    <div className="bili-bind">
      {qr ? (
        <>
          <QrCanvas text={qr.url} />
          <p className="bili-bind-tip">
            {status === "scanned"
              ? "已扫描，请在手机上确认登录"
              : status === "expired"
                ? "二维码已过期，请重新获取"
                : "用 B 站手机 App 扫码登录"}
          </p>
          {status === "expired" && (
            <button className="app-btn-primary" onClick={start}>
              换一张二维码
            </button>
          )}
          {note && <p className="bili-bind-note">{note}</p>}
          <a
            className="bili-bind-open"
            href={qr.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            扫不动？在本机浏览器里打开这个登录页
          </a>
        </>
      ) : (
        <>
          <p className="bili-bind-lead">
            绑定后可在站内直接播放（自带弹幕），解锁高清晰度，
            并按实际观看进度自动打卡。凭据只存在本站服务端，随时可解绑。
          </p>
          <label className="bili-agree">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              我已阅读并同意
              <Link href="/terms" target="_blank">
                《用户协议与隐私说明》
              </Link>
            </span>
          </label>
          <button
            className="app-btn-primary"
            onClick={start}
            disabled={!agreed || status === "pending"}
          >
            {status === "pending" ? (
              <>
                <Loader2 size={15} className="spin" aria-hidden /> 获取二维码…
              </>
            ) : (
              <>
                <QrCode size={15} aria-hidden /> 扫码绑定 B 站账号
              </>
            )}
          </button>
        </>
      )}
      {error && <p className="bili-bind-error">{error}</p>}
    </div>
  );
}
