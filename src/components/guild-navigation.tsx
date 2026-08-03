"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  FlaskConical,
  Home,
  Library,
  Map,
  Orbit,
  Shield,
  UserRound,
} from "lucide-react";

const ITEMS = [
  { href: "/", label: "公会大厅", short: "大厅", icon: Home, key: "1" },
  { href: "/paths", label: "远征地图", short: "地图", icon: Map, key: "2" },
  { href: "/courses", label: "副本档案", short: "副本", icon: Library, key: "3" },
  { href: "/skill-tree", label: "技能星盘", short: "技能", icon: Orbit, key: "4" },
  { href: "/jobs", label: "转职殿堂", short: "职业", icon: Shield, key: "5" },
  { href: "/lab", label: "实验设施", short: "工坊", icon: FlaskConical, key: "6" },
  { href: "/glossary", label: "知识卷宗", short: "卷宗", icon: BookOpenText, key: "7" },
] as const;

export function GuildNavigation({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname();
  const items = loggedIn
    ? [...ITEMS, { href: "/me", label: "角色档案", short: "角色", icon: UserRound, key: "8" }]
    : ITEMS;
  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="game-command-deck" aria-label="公会行动快捷栏">
      <div className="game-command-slots">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`game-command ${active(item.href) ? "active" : ""}`}
              title={item.label}
            >
              <span className="game-command-key">{item.key}</span>
              <Icon aria-hidden size={20} strokeWidth={1.65} />
              <span className="game-command-label">{item.short}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
