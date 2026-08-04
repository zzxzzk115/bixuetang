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
  light: "浅色",
  dark: "深色",
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

  // 三态直接摆出来，比「点一下轮换一格」少猜一步
  return (
    <div className="theme-switch" role="radiogroup" aria-label="配色">
      {ORDER.map((option) => {
        const Icon = ICON[option];
        return (
          <button
            key={option}
            role="radio"
            aria-checked={pref === option}
            className={pref === option ? "on" : undefined}
            onClick={() => setThemePref(option)}
          >
            <Icon aria-hidden size={15} />
            <span>{LABEL[option]}</span>
          </button>
        );
      })}
    </div>
  );
}
