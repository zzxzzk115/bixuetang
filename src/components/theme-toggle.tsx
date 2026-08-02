"use client";

import { useEffect, useSyncExternalStore } from "react";

// 三档主题：auto（跟随系统）/ light / dark。
// 首屏解析在 layout 的内联脚本里完成（防闪烁）；
// 偏好存 localStorage，经 useSyncExternalStore 读取（服务端渲染回退 auto）。

type ThemePref = "auto" | "light" | "dark";

const STORAGE_KEY = "guild-theme";
const ORDER: ThemePref[] = ["auto", "light", "dark"];
const ICON: Record<ThemePref, string> = { auto: "🌗", light: "☀️", dark: "🌙" };
const LABEL: Record<ThemePref, string> = {
  auto: "跟随系统",
  light: "白天",
  dark: "黑夜",
};

let listeners: (() => void)[] = [];

function subscribe(cb: () => void): () => void {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function getSnapshot(): ThemePref {
  const stored = localStorage.getItem(STORAGE_KEY) as ThemePref | null;
  return stored && ORDER.includes(stored) ? stored : "auto";
}

function resolve(pref: ThemePref): "light" | "dark" {
  if (pref !== "auto") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function setThemePref(pref: ThemePref): void {
  localStorage.setItem(STORAGE_KEY, pref);
  document.documentElement.dataset.theme = resolve(pref);
  for (const l of listeners) l();
}

export function ThemeToggle() {
  const pref = useSyncExternalStore(subscribe, getSnapshot, () => "auto" as const);

  // auto 模式下响应系统主题变化
  useEffect(() => {
    if (pref !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      document.documentElement.dataset.theme = resolve("auto");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];

  return (
    <button
      onClick={() => setThemePref(next)}
      title={`主题：${LABEL[pref]}（点击切换为${LABEL[next]}）`}
      className="w-7 text-center text-muted transition-colors hover:text-foreground"
    >
      {ICON[pref]}
    </button>
  );
}
