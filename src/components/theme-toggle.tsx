"use client";

import { MonitorCog, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

type ThemePref = "auto" | "light" | "dark";

const STORAGE_KEY = "guild-theme";
const ORDER: ThemePref[] = ["auto", "light", "dark"];
const ICON = {
  auto: MonitorCog,
  light: Sun,
  dark: Moon,
} as const;
const LABEL: Record<ThemePref, string> = {
  auto: "跟随系统",
  light: "日间卷宗",
  dark: "夜间远征",
};

let listeners: (() => void)[] = [];

function subscribe(cb: () => void): () => void {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((listener) => listener !== cb);
  };
}

function getSnapshot(): ThemePref {
  const stored = localStorage.getItem(STORAGE_KEY) as ThemePref | null;
  return stored && ORDER.includes(stored) ? stored : "auto";
}

function resolve(pref: ThemePref): "light" | "dark" {
  if (pref !== "auto") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function setThemePref(pref: ThemePref): void {
  localStorage.setItem(STORAGE_KEY, pref);
  document.documentElement.dataset.theme = resolve(pref);
  for (const listener of listeners) listener();
}

export function ThemeToggle() {
  const pref = useSyncExternalStore(subscribe, getSnapshot, () => "auto" as const);

  useEffect(() => {
    if (pref !== "auto") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      document.documentElement.dataset.theme = resolve("auto");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [pref]);

  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  const Icon = ICON[pref];

  return (
    <button
      onClick={() => setThemePref(next)}
      title={`当前主题：${LABEL[pref]}。切换为${LABEL[next]}`}
      aria-label={`切换主题，当前为${LABEL[pref]}`}
      className="hud-icon-button"
    >
      <Icon aria-hidden size={16} />
    </button>
  );
}
