"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { adminLogout } from "@/lib/admin/auth-actions";

const NAV = [
  { href: "/console", label: "概览", icon: LayoutDashboard, exact: true },
  { href: "/console/users", label: "用户", icon: Users, exact: false },
  { href: "/console/reports", label: "视频反馈", icon: Inbox, exact: false },
  { href: "/console/settings", label: "设置", icon: Settings, exact: false },
];

export function AdminShell({
  username,
  mustChange,
  children,
}: {
  username: string;
  mustChange: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="admin-side-brand">
          <ShieldCheck size={20} strokeWidth={2.4} />
          <b>管理端</b>
        </div>
        <nav className="admin-side-nav" aria-label="管理端导航">
          {NAV.map((n) => {
            const active = n.exact
              ? pathname === n.href
              : pathname.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`admin-side-link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={17} aria-hidden />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="admin-side-foot">
          <span className="admin-side-who">@{username}</span>
          <form action={adminLogout}>
            <button type="submit" className="admin-side-logout">
              <LogOut size={15} aria-hidden /> 退出
            </button>
          </form>
        </div>
      </aside>
      <main className="admin-main">
        {mustChange ? (
          <div className="admin-banner">
            你还在用默认密码，请尽快到
            <Link href="/console/settings"> 设置 </Link>
            修改。
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
