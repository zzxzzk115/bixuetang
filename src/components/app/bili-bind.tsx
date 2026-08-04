"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, QrCode, Smartphone, Unlink } from "lucide-react";
import {
  pollBiliLogin,
  startBiliLogin,
  unbindBili,
} from "@/lib/bili/actions";
import { qrMatrix } from "@/lib/qr/encode";

// bilibili 账号绑定：扫码登录。二维码在浏览器本地画（自写编码器，不依赖外部图床）。

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
      aria-label="bilibili 登录二维码"
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

  /** 当前的轮询体，供「页面重新可见」时立刻补一次 */
  const tickRef = useRef<(() => void) | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    tickRef.current = null;
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // 从 bilibili App 切回来时后台定时器多半被冻结了，回前台先补查一次
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) tickRef.current?.();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

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
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
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
        // 非预期状态把 bilibili 原始返回显示出来，免得只能干等
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
      } finally {
        busy = false;
      }
    };
    tickRef.current = () => void tick();
    timerRef.current = setInterval(() => void tick(), 2500);
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
          // bilibili 头像是外部图源，用原生 img 避开 next/image 的域名白名单
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
            <CheckCircle2 size={15} aria-hidden /> 已绑定 bilibili 账号
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
          {/* 手机上没法自己扫自己：直接打开这个地址会唤起 bilibili App 确认。
              必须新开标签页：本页要留在原地继续轮询，确认完这边自动绑定 */}
          <a
            className="app-btn-primary bili-auth-app"
            href={qr.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            <Smartphone size={16} aria-hidden /> 在 bilibili App 中确认登录
          </a>
          <p className="bili-auth-or">
            确认后回到本页，这里会自动完成绑定 · 或用另一台设备扫码
          </p>
          <QrCanvas text={qr.url} />
          <p className="bili-bind-tip">
            {status === "scanned"
              ? "已扫描，请在手机上确认登录"
              : status === "expired"
                ? "二维码已过期，请重新获取"
                : "用 bilibili 手机 App 扫码登录"}
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
                <QrCode size={15} aria-hidden /> 扫码绑定 bilibili 账号
              </>
            )}
          </button>
        </>
      )}
      {error && <p className="bili-bind-error">{error}</p>}
    </div>
  );
}
