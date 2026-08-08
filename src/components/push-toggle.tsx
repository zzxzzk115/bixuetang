"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

// 学习提醒开关:请求通知权限 → 用 VAPID 公钥订阅 → 存到服务端。
// Service Worker 只在生产/已安装 App 下注册(dev 会主动注销),故 dev 里提示先安装。

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type State = "loading" | "unsupported" | "denied" | "nosw" | "off" | "on";

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const probe = async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (alive) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (alive) setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        if (alive) setState("nosw");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (alive) setState(sub ? "on" : "off");
    };
    void probe();
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { key } = await fetch("/api/push/key").then((r) => r.json());
      if (!key) {
        setMsg("服务端还没配置推送密钥");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const r = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (r.ok) {
        setState("on");
        setMsg("已开启学习提醒");
      } else {
        setMsg("开启失败,稍后再试");
      }
    } catch {
      setMsg("开启失败,可能被浏览器拦截了");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
      setMsg("已关闭");
    } catch {
      setMsg("操作失败,稍后再试");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading")
    return (
      <p className="me-note">
        <Loader2 size={14} className="spin" aria-hidden /> 检查中…
      </p>
    );
  if (state === "unsupported")
    return <p className="me-note">当前浏览器不支持推送通知。</p>;
  if (state === "denied")
    return (
      <p className="me-note">
        通知权限已被拒绝,请到浏览器设置里恢复本站通知后再试。
      </p>
    );
  if (state === "nosw")
    return (
      <p className="me-note">
        把必学堂「添加到主屏 / 安装为 App」后,就能开启学习提醒了。
      </p>
    );

  return (
    <div className="push-toggle">
      <button
        className={state === "on" ? "app-btn-plain" : "app-btn-primary"}
        onClick={state === "on" ? disable : enable}
        disabled={busy}
      >
        {busy ? (
          <Loader2 size={15} className="spin" aria-hidden />
        ) : state === "on" ? (
          <BellOff size={15} aria-hidden />
        ) : (
          <Bell size={15} aria-hidden />
        )}
        {state === "on" ? "关闭学习提醒" : "开启学习提醒"}
      </button>
      {msg && <p className="me-note">{msg}</p>}
    </div>
  );
}
