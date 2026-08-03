"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Backpack,
  BookOpen,
  Coins,
  Flame,
  Map as MapIcon,
  Swords,
  User,
} from "lucide-react";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";

// 移动端 App 壳：顶栏（路线胶囊 + 资源徽章）+ 底部 Tab 导航。
// 多邻国式布局——内容区在中间滚动，顶底两条常驻。桌面端同一布局居中限宽。

const TABS = [
  { key: "map", label: "地图", href: "/play", icon: MapIcon },
  { key: "trial", label: "试炼", href: "/play/trial", icon: Swords },
  { key: "bag", label: "背包", href: "/me", icon: Backpack },
  { key: "lexicon", label: "卷宗", href: "/glossary", icon: BookOpen },
  { key: "me", label: "我的", href: "/settings", icon: User },
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

      <nav className="app-tabs" aria-label="主导航">
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
    </div>
  );
}
