import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { Inbox, Library, Users } from "lucide-react";
import { getContent } from "@/lib/content/load";
import { db } from "@/lib/db/client";
import { users, videoReports } from "@/lib/db/schema";

export const metadata = { title: "概览" };
export const dynamic = "force-dynamic";

export default async function ConsoleHome() {
  const userCount =
    db.select({ n: sql<number>`count(*)` }).from(users).get()?.n ?? 0;
  const pendingReports =
    db
      .select({ n: sql<number>`count(*)` })
      .from(videoReports)
      .where(eq(videoReports.resolved, false))
      .get()?.n ?? 0;
  const courseCount = getContent().courses.length;

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <h1>概览</h1>
        <p className="admin-muted">站点运营与用户数据维护。</p>
      </header>

      <div className="admin-stats">
        <Link href="/console/users" className="admin-stat">
          <Users size={20} aria-hidden />
          <b>{userCount}</b>
          <span>用户</span>
        </Link>
        <Link href="/console/reports" className="admin-stat">
          <Inbox size={20} aria-hidden />
          <b>{pendingReports}</b>
          <span>待处理反馈</span>
        </Link>
        <div className="admin-stat is-static">
          <Library size={20} aria-hidden />
          <b>{courseCount}</b>
          <span>在册课程</span>
        </div>
      </div>

      <section className="admin-card">
        <h2>模块</h2>
        <div className="admin-modules">
          <Link href="/console/users" className="admin-module">
            <Users size={18} aria-hidden />
            <div>
              <b>用户管理</b>
              <small>搜索用户,查看/调整进度、解锁、金币与道具。</small>
            </div>
          </Link>
          <Link href="/console/reports" className="admin-module">
            <Inbox size={18} aria-hidden />
            <div>
              <b>视频失效反馈</b>
              <small>处理用户上报,复核后补备用搬运再标记已处理。</small>
            </div>
            {pendingReports ? (
              <span className="admin-badge">{pendingReports}</span>
            ) : null}
          </Link>
        </div>
      </section>
    </div>
  );
}
