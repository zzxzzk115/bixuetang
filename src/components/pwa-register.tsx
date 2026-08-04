"use client";

import { useEffect } from "react";

// 注册 Service Worker。没有它浏览器不会认为这个站「可安装」，
// 也就不会出现安装提示——manifest 只是必要条件之一。
//
// 注意：Service Worker 只在**安全上下文**下可用，即 HTTPS 或 localhost。
// 裸 HTTP 的部署下 navigator.serviceWorker 直接是 undefined，
// 这里会静默跳过，站点照常工作，只是装不成 App。

type StandaloneNavigator = Navigator & { standalone?: boolean };

export function PwaRegister() {
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as StandaloneNavigator).standalone === true;
    document.documentElement.dataset.pwaStandalone = standalone ? "1" : "0";
    const iosLike =
      /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    document.documentElement.dataset.ios = iosLike ? "1" : "0";

    if (!("serviceWorker" in navigator)) return;
    // 挂载即注册；失败不打扰用户，控制台留个记录就够了
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service Worker 注册失败", err);
    });
  }, []);

  return null;
}
