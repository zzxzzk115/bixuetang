import type { MetadataRoute } from "next";

// PWA 清单。Next 的 App Router 会把这个文件挂成 /manifest.webmanifest。
//
// Chrome Android 安装 PWA 时更认 192/512 位图；SVG 保留给浏览器标签页与高 DPI。

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
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
