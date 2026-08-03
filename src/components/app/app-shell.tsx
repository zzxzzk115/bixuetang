"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Backpack,
  BookOpen,
  Coins,
  Flame,
  Map as MapIcon,
  Shield,
  Swords,
  User,
} from "lucide-react";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";

// App 壳，随视口变形（多邻国式）：
//   移动端  —— 顶栏（路线胶囊 + 资源徽章）+ 底部 Tab
//   桌面端  —— 左侧导航栏 + 中间内容列 + 右侧统计栏（占满全屏，无竖屏假框）
// 同一份 markup，纯 CSS 切换。

const TABS = [
  { key: "map", label: "地图", href: "/play", icon: MapIcon },
  { key: "trial", label: "试炼", href: "/play/trial", icon: Swords },
  { key: "bag", label: "背包", href: "/me", icon: Backpack },
  { key: "lexicon", label: "卷宗", href: "/glossary", icon: BookOpen },
  { key: "me", label: "我的", href: "/settings", icon: User },
] as const;

const STAT_LABEL = [
  ["insight", "洞察"],
  ["focus", "专注"],
  ["precision", "精准"],
  ["resolve", "意志"],
] as const;

export function AppShell({
  bootstrap,
  routeTitle,
  onRoutePress,
  children,
}: {
  bootstrap: GameBootstrap;
  routeTitle?: string;
  onRoutePress?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="app-root">
      <nav className="app-tabs" aria-label="主导航">
        <span className="app-brand" aria-hidden>
          <Shield size={26} strokeWidth={2.4} />
          <b>学者公会</b>
        </span>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active =
            tab.href === "/play"
              ? pathname === "/play"
              : pathname.startsWith(tab.href);
          return (
            <button
              key={tab.key}
              className={active ? "active" : undefined}
              onClick={() => router.push(tab.href)}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden size={24} strokeWidth={2.4} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="app-main">
        <header className="app-topbar">
          {routeTitle ? (
            <button className="app-route-pill" onClick={onRoutePress}>
              <span className="app-route-pill-icon">🗺</span>
              <span className="app-route-pill-title">{routeTitle}</span>
              <span aria-hidden>▾</span>
            </button>
          ) : (
            <span className="app-route-pill-title">学者公会</span>
          )}
          <div className="app-topbar-stats">
            <span className="app-stat streak" title="连续学习天数">
              <Flame aria-hidden size={18} />
              {bootstrap.streak}
            </span>
            <span className="app-stat coins" title="金币">
              <Coins aria-hidden size={18} />
              {bootstrap.rpg.coins}
            </span>
          </div>
        </header>

        <main className="app-content">{children}</main>
      </div>

      {/* 桌面右侧统计栏（移动端隐藏） */}
      <aside className="app-rail" aria-label="学者状态">
        <section className="app-rail-card">
          <h3>
            Lv.{bootstrap.level.level} · {bootstrap.user.name}
          </h3>
          <div className="app-rail-bar">
            <i style={{ width: `${Math.round(bootstrap.level.ratio * 100)}%` }} />
          </div>
          <small>
            {bootstrap.level.current}/{bootstrap.level.span} XP
          </small>
        </section>
        <section className="app-rail-card app-rail-row">
          <span className="app-stat streak">
            <Flame aria-hidden size={20} />
            {bootstrap.streak}
            <small>连胜</small>
          </span>
          <span className="app-stat coins">
            <Coins aria-hidden size={20} />
            {bootstrap.rpg.coins}
            <small>金币</small>
          </span>
        </section>
        <section className="app-rail-card">
          <h3>四维 · 战力 {bootstrap.rpg.power}</h3>
          <div className="app-rail-stats">
            {STAT_LABEL.map(([key, label]) => (
              <span key={key}>
                <small>{label}</small>
                <b>{bootstrap.rpg.stats[key]}</b>
              </span>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
