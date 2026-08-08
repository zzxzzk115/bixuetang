"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { adminLogout } from "@/lib/admin/auth-actions";

// primary=窄屏也常驻;其余(设置等)在手机上收进「⋯ 更多」菜单。
// 以后加模块只把常用的标 primary,导航就不会在小屏挤爆。
const NAV = [
  { href: "/console", label: "概览", icon: LayoutDashboard, exact: true, primary: true },
  { href: "/console/users", label: "用户", icon: Users, exact: false, primary: true },
  { href: "/console/reports", label: "视频反馈", icon: Inbox, exact: false, primary: true },
  { href: "/console/career-suggestions", label: "职业建议", icon: Target, exact: false, primary: false },
  { href: "/console/tips", label: "课程心得", icon: MessageSquare, exact: false, primary: false },
  { href: "/console/settings", label: "设置", icon: Settings, exact: false, primary: false },
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
  const [moreOpen, setMoreOpen] = useState(false);
  const isActive = (n: (typeof NAV)[number]) =>
    n.exact ? pathname === n.href : pathname.startsWith(n.href);
  const overflow = NAV.filter((n) => !n.primary);

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="admin-side-brand">
          <ShieldCheck size={20} strokeWidth={2.4} />
          <b>管理端</b>
        </div>
        <nav className="admin-side-nav" aria-label="管理端导航">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`admin-side-link${isActive(n) ? " is-active" : ""}${
                  n.primary ? "" : " admin-side-link--overflow"
                }`}
                aria-current={isActive(n) ? "page" : undefined}
              >
                <Icon size={17} aria-hidden />
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* 桌面:侧栏底部常驻账户 + 退出 */}
        <div className="admin-side-foot">
          <span className="admin-side-who">@{username}</span>
          <form action={adminLogout}>
            <button type="submit" className="admin-side-logout">
              <LogOut size={15} aria-hidden /> 退出
            </button>
          </form>
        </div>

        {/* 手机:空间不够时,溢出项 + 账户收进「⋯ 更多」 */}
        <div className="admin-more">
          <button
            type="button"
            className="admin-more-btn"
            aria-label="更多"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
          >
            <MoreHorizontal size={20} aria-hidden />
          </button>
          {moreOpen ? (
            <>
              <div
                className="admin-more-backdrop"
                onClick={() => setMoreOpen(false)}
              />
              <div className="admin-more-menu" role="menu">
                {overflow.map((n) => {
                  const Icon = n.icon;
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      role="menuitem"
                      className={`admin-more-item${isActive(n) ? " is-active" : ""}`}
                      onClick={() => setMoreOpen(false)}
                    >
                      <Icon size={16} aria-hidden />
                      {n.label}
                    </Link>
                  );
                })}
                <div className="admin-more-sep" />
                <span className="admin-more-who">@{username}</span>
                <form action={adminLogout}>
                  <button type="submit" className="admin-more-logout">
                    <LogOut size={15} aria-hidden /> 退出
                  </button>
                </form>
              </div>
            </>
          ) : null}
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
