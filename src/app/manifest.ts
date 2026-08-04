import type { MetadataRoute } from "next";

// PWA 清单。Next 的 App Router 会把这个文件挂成 /manifest.webmanifest。
//
// 图标全部指向 /icon.svg：单个矢量文件在任何 DPI 下都清晰，
// 省掉一整套 192/512 位图的生成与同步。purpose 里给 maskable，
// 安卓才会把它裁成系统统一的图标形状而不是套一层白底。

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "必学堂",
    short_name: "必学堂",
    description: "把公开课学成通关——游戏化的公开课自学工具。",
    start_url: "/play",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#58cc02",
    lang: "zh-CN",
    categories: ["education"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
