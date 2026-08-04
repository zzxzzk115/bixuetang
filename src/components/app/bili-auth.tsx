"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, QrCode, Smartphone } from "lucide-react";
import {
  completeBiliSignup,
  pollBiliAuth,
  startBiliAuth,
} from "@/lib/bili/auth-actions";
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
      aria-label="bilibili 登录二维码"
    >
      <rect width={total} height={total} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

export function BiliAuth() {
  const router = useRouter();
  /** 必须先同意用户协议才出码 */
  const [agreed, setAgreed] = useState(false);
  const [qr, setQr] = useState<{ url: string; key: string; buvid?: string } | null>(
    null,
  );
  const [status, setStatus] = useState<
    "idle" | "loading" | "waiting" | "scanned" | "expired" | "ok" | "signup"
  >("idle");
  /** 首次进站要填的开号表单 */
  const [signup, setSignup] = useState<{
    token: string;
    username: string;
    displayName: string;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
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

  // 手机上切去 bilibili App 确认再切回来时，后台标签的定时器常被冻结，
  // 回到前台先补查一次，别让用户对着二维码干等一轮
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
        if (poll.status === "signup") {
          // 首次进站：扫码只证明「你是谁」，账号还得自己开
          stopPolling();
          setStatus("signup");
          setSignup({
            token: poll.signupToken!,
            username: poll.suggestedUsername ?? "",
            displayName: poll.biliNickname ?? "",
          });
        }
        if (poll.status === "ok") {
          setStatus("ok");
          stopPolling();
          router.replace("/play");
          router.refresh();
        }
      } finally {
        busy = false;
      }
    };
    tickRef.current = () => void tick();
    timerRef.current = setInterval(() => void tick(), 2500);
  }, [router, stopPolling]);

  const submitSignup = async () => {
    if (!signup) return;
    setError(null);
    setSubmitting(true);
    const r = await completeBiliSignup(
      signup.token,
      signup.username,
      password,
      signup.displayName,
    );
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error ?? "开号失败");
      return;
    }
    router.replace("/play");
    router.refresh();
  };

  // 首次进站：扫码只证明了「你是谁」，账号还得自己开——
  // 定下用户名和密码，以后换台没装 bilibili 的设备也能登进来。
  if (signup) {
    return (
      <div className="bili-auth bili-signup">
        <h3>就差一步：给自己开个号</h3>
        <p className="bili-signup-lead">
          已认到 bilibili 账号
          {signup.displayName ? `「${signup.displayName}」` : ""}。
          设一组用户名和密码，以后不用 bilibili 也能登录。
        </p>
        <label className="bili-signup-field">
          <span>用户名</span>
          <input
            value={signup.username}
            autoComplete="username"
            placeholder="3–32 位小写字母、数字或下划线"
            onChange={(e) =>
              setSignup({ ...signup, username: e.target.value.toLowerCase() })
            }
          />
        </label>
        <label className="bili-signup-field">
          <span>密码</span>
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            placeholder="至少 8 位"
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="bili-signup-field">
          <span>昵称</span>
          <input
            value={signup.displayName}
            placeholder="留空就用 bilibili 昵称"
            onChange={(e) =>
              setSignup({ ...signup, displayName: e.target.value })
            }
          />
        </label>
        <button
          className="app-btn-primary"
          onClick={() => void submitSignup()}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2 size={15} className="spin" aria-hidden /> 开号中…
            </>
          ) : (
            "确认开号并进入"
          )}
        </button>
        {error && <p className="bili-bind-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="bili-auth">
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

      {!agreed ? (
        <p className="bili-auth-gate">勾选后即可获取二维码</p>
      ) : qr ? (
        <>
          {/* 手机上没法自己扫自己，直接打开这个地址会唤起 bilibili App 确认登录。
              必须新开标签页：本页要留在原地继续轮询，确认完这边自动进站 */}
          <a
            className="app-btn-primary bili-auth-app"
            href={qr.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            <Smartphone size={16} aria-hidden /> 在 bilibili App 中确认登录
          </a>
          <p className="bili-auth-or">
            确认后回到本页，这里会自动进站 · 或用另一台设备扫码
          </p>
          <Qr text={qr.url} />
          <p className="bili-auth-tip">
            {status === "scanned"
              ? "已扫描，请在手机上确认"
              : status === "ok"
                ? "登录成功，正在进入…"
                : status === "expired"
                  ? "二维码已过期"
                  : "用 bilibili 手机 App 扫码，即可登录或开号"}
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
