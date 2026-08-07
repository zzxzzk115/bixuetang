"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// 开发调试助手:左下角常驻当前页面的局域网地址二维码,
// 手机/平板扫一下就进同一页,真机调试不用手敲 IP。
// 只在 dev 且服务端探测到局域网地址(data-lan-origin)时渲染;
// 生产构建里 NODE_ENV 分支直接把组件体摇没。

export function DevLanQr() {
  const pathname = usePathname();
  const [card, setCard] = useState<{ qr: string; url: string } | null>(null);
  // 手机默认收起(它就是扫码进来的,再挂个二维码没意义),电脑默认展开;
  // 点击随时切换
  const [collapsed, setCollapsed] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.dataset.device === "mobile",
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const lanOrigin = document.documentElement.dataset.lanOrigin;
    if (!lanOrigin) return;
    const full = `${lanOrigin}${pathname}${window.location.search}`;
    let cancelled = false;
    void import("qrcode").then(({ default: QRCode }) =>
      QRCode.toDataURL(full, { width: 240, margin: 1 }).then((data) => {
        if (!cancelled) setCard({ qr: data, url: full });
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (process.env.NODE_ENV !== "development" || !card) return null;
  const { qr, url } = card;

  return (
    <button
      className={`dev-lan-qr ${collapsed ? "collapsed" : ""}`}
      onClick={() => setCollapsed(!collapsed)}
      title={collapsed ? "展开调试二维码" : "点击收起"}
    >
      {collapsed ? (
        <span className="dev-lan-qr-pill">LAN</span>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
          <img src={qr} alt="局域网调试二维码" />
          <small>{url.replace(/^https?:\/\//, "")}</small>
        </>
      )}
    </button>
  );
}
