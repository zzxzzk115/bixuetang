"use client";

import dynamic from "next/dynamic";

// 实验室整体按路由分包且禁 SSR（WebGL/CodeMirror 均依赖浏览器环境）
const HackLab = dynamic(
  () => import("./hack-lab").then((m) => m.HackLab),
  {
    ssr: false,
    loading: () => (
      <p className="py-20 text-center text-sm text-muted">实验室加载中……</p>
    ),
  },
);

export function HackLabLoader() {
  return <HackLab supportedKinds={["asm", "jack"]} />;
}
