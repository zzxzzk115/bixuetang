"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Atom,
  Backpack,
  BookOpen,
  Brain,
  Cpu,
  FlaskConical,
  Coins,
  Flame,
  Map as MapIcon,
  MoreHorizontal,
  ShoppingBag,
  Sigma,
  Swords,
  User,
  X,
  Zap,
} from "lucide-react";
import { GuildSigil } from "@/components/guild-sigil";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";

// App 壳，随视口变形（多邻国式）：
//   移动端  —— 顶栏（路线胶囊 + 资源徽章）+ 底部 Tab
//   桌面端  —— 左侧导航栏 + 中间内容列 + 右侧统计栏（占满全屏，无竖屏假框）
// 同一份 markup，纯 CSS 切换。

const TABS = [
  { key: "map", label: "地图", href: "/play", icon: MapIcon },
  { key: "trial", label: "试炼", href: "/play/trial", icon: Swords },
  { key: "shop", label: "商店", href: "/play/shop", icon: ShoppingBag },
  { key: "bag", label: "背包", href: "/play/bag", icon: Backpack },
  { key: "lexicon", label: "卷宗", href: "/glossary", icon: BookOpen },
  // 工坊要键盘，窄屏上藏起来（CSS 控制），底部 Tab 也塞不下这么多项
  { key: "lab", label: "工坊", href: "/lab/hack", icon: FlaskConical, desktopOnly: true },
  { key: "me", label: "我的", href: "/settings", icon: User },
] as const;

const SUBJECT_TONE: Record<string, string> = {
  cs: "var(--app-blue)",
  math: "var(--app-teal)",
  physics: "var(--app-orange)",
  ai: "var(--app-green)",
};

function SubjectIcon({ subject }: { subject?: string }) {
  const size = 17;
  if (subject === "math") return <Sigma size={size} aria-hidden />;
  if (subject === "physics") return <Atom size={size} aria-hidden />;
  if (subject === "ai") return <Brain size={size} aria-hidden />;
  if (subject === "cs") return <Cpu size={size} aria-hidden />;
  return <MapIcon size={size} aria-hidden />;
}

/** 底部 Tab 直接摆出来的数量，其余收进「更多」。
 *  地图/试炼/商店/背包/卷宗都是天天点的，留在外面；
 *  工坊（窄屏本来就隐藏）与我的收进菜单。 */
const MOBILE_TABS = 5;

const STAT_LABEL = [
  ["insight", "洞察"],
  ["focus", "专注"],
  ["precision", "精准"],
  ["resolve", "意志"],
] as const;

export function AppShell({
  bootstrap,
  routeTitle,
  routeSubject,
  wide,
  onRoutePress,
  children,
}: {
  bootstrap: GameBootstrap;
  routeTitle?: string;
  /** 当前路线的学科，决定胶囊上的图标与配色 */
  routeSubject?: string;
  /** 宽屏页面（实验室、工坊）：内容列不受 720px 限宽 */
  wide?: boolean;
  onRoutePress?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // 底部 Tab 放得下的数量有限，窄屏尤其挤。前 MOBILE_TABS 个直接摆出来，
  // 其余收进「更多」——不做的话第 6、7 项会被挤成一条缝，谁都点不准。
  // 桌面是竖向侧栏，位置管够，全部平铺（CSS 里把 .app-tab-more 藏掉）。
  const overflow = TABS.slice(MOBILE_TABS);
  const overflowActive = overflow.some((t) => pathname.startsWith(t.href));

  const go = (href: string) => {
    setMoreOpen(false);
    router.push(href);
  };

  return (
    <div className="app-root">
      <nav className="app-tabs" aria-label="主导航">
        <span className="app-brand" aria-hidden>
          {/* 站点徽记与 favicon 同源（src/lib/brand/sigil.ts），
              别在这里另挑一个图标，否则品牌两处对不上 */}
          <GuildSigil size={26} />
          <b>必学堂</b>
        </span>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active =
            tab.href === "/play"
              ? pathname === "/play"
              : pathname.startsWith(tab.href);
          const inOverflow = overflow.includes(tab);
          return (
            <button
              key={tab.key}
              className={[
                active ? "active" : "",
                "desktopOnly" in tab && tab.desktopOnly ? "is-desktop-only" : "",
                // 挤不下的那几项在窄屏交给「更多」菜单，桌面侧栏照常平铺
                inOverflow ? "app-tab-overflow" : "",
              ].join(" ")}
              onClick={() => go(tab.href)}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden size={24} strokeWidth={2.4} />
              <span>{tab.label}</span>
            </button>
          );
        })}

        {overflow.length > 0 && (
          <button
            className={`app-tab-more ${overflowActive ? "active" : ""}`}
            onClick={() => setMoreOpen(true)}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal aria-hidden size={24} strokeWidth={2.4} />
            <span>更多</span>
          </button>
        )}
      </nav>

      {moreOpen && (
        <div className="app-sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div
            className="app-sheet app-more-sheet"
            role="menu"
            aria-label="更多"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <b>更多</b>
              <button onClick={() => setMoreOpen(false)} aria-label="关闭">
                <X size={20} />
              </button>
            </header>
            {overflow.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  role="menuitem"
                  className={[
                    "app-more-item",
                    pathname.startsWith(tab.href) ? "active" : "",
                    "desktopOnly" in tab && tab.desktopOnly
                      ? "is-desktop-only"
                      : "",
                  ].join(" ")}
                  onClick={() => go(tab.href)}
                >
                  <Icon aria-hidden size={20} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={`app-main ${wide ? "is-wide" : ""}`}>
        <header className="app-topbar">
          {routeTitle ? (
            <button className="app-route-pill" onClick={onRoutePress}>
              {/* 一眼看出这条线是什么学科，比一个通用的地图 emoji 有用 */}
              <span
                className="app-route-pill-icon"
                style={{ color: SUBJECT_TONE[routeSubject ?? ""] }}
              >
                <SubjectIcon subject={routeSubject} />
              </span>
              <span className="app-route-pill-title">{routeTitle}</span>
              <span aria-hidden>▾</span>
            </button>
          ) : (
            // 非地图页左侧留空（品牌字只在桌面侧栏出现）
            <span aria-hidden />
          )}
          <div className="app-topbar-stats">
            {bootstrap.boost && bootstrap.boost.episodesLeft > 0 && (
              <span
                className="app-stat boost"
                title={`经验 ×${bootstrap.boost.multiplierPct / 100}，还剩 ${bootstrap.boost.episodesLeft} 次结算(整集或章节)`}
              >
                <Zap aria-hidden size={18} />×
                {bootstrap.boost.multiplierPct / 100}
                <small>{bootstrap.boost.episodesLeft}次</small>
              </span>
            )}
            <span className="app-stat streak" title="连续学习天数">
              <Flame aria-hidden size={18} />
              {bootstrap.streak}
            </span>
            <button
              className="app-stat coins"
              title="金币 · 点击进商店"
              onClick={() => router.push("/play/shop")}
            >
              <Coins aria-hidden size={18} />
              {bootstrap.rpg.coins}
            </button>
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
