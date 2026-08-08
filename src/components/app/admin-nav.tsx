"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, LayoutDashboard } from "lucide-react";

// 管理端内部导航。以后加模块(用户/内容体检/探活台账)在这里挂一个 tab 即可。
const TABS = [
  { href: "/admin", label: "概览", icon: LayoutDashboard, exact: true },
  { href: "/admin/reports", label: "视频反馈", icon: Inbox, exact: false },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="管理端导航">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`admin-nav-tab${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={16} aria-hidden />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
