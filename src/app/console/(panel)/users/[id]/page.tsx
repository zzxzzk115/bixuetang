import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminUserTools } from "@/components/admin/admin-user-tools";
import { courseCatalog, itemCatalog } from "@/lib/admin/catalog";
import { adminGetUserDetail } from "@/lib/admin/users";

export const metadata = { title: "用户详情" };
export const dynamic = "force-dynamic";

function fmt(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) notFound();
  const u = await adminGetUserDetail(userId);
  if (!u) notFound();

  return (
    <div className="admin-page">
      <Link href="/console/users" className="admin-back">
        <ArrowLeft size={15} aria-hidden /> 返回用户列表
      </Link>

      <header className="admin-page-head">
        <h1>
          {u.displayName || u.username}{" "}
          <span className="admin-muted">#{u.id}</span>
        </h1>
        <p className="admin-muted">
          用户名 @{u.username} · 注册 {fmt(u.createdAt)}
          {u.bili ? ` · bilibili ${u.bili.nickname ?? u.bili.mid}` : ""}
        </p>
      </header>

      <section className="admin-card">
        <h2>数值</h2>
        <div className="admin-kv">
          <div>
            <b>Lv.{u.level}</b>
            <span>{u.totalXp} XP</span>
          </div>
          <div>
            <b>{u.coins}</b>
            <span>金币</span>
          </div>
          <div>
            <b>{u.shieldHearts}</b>
            <span>护盾</span>
          </div>
          <div>
            <b>{u.equipSlots}</b>
            <span>装备槽</span>
          </div>
          <div>
            <b>{u.streak?.current ?? 0}</b>
            <span>连胜(最佳 {u.streak?.best ?? 0} · 冻结 {u.streak?.freezes ?? 0})</span>
          </div>
        </div>
      </section>

      <AdminUserTools
        userId={u.id}
        courseOptions={courseCatalog()}
        itemOptions={itemCatalog()}
      />

      <section className="admin-card">
        <h2>课程进度 · {u.courses.length}</h2>
        {u.courses.length === 0 ? (
          <p className="admin-muted">还没有任何课程进度。</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>课程</th>
                  <th>状态</th>
                  <th>进度</th>
                </tr>
              </thead>
              <tbody>
                {u.courses.map((c) => (
                  <tr key={c.courseId}>
                    <td>{c.title}</td>
                    <td>{c.status ?? "—"}</td>
                    <td>
                      {c.watched}/{c.episodes || "?"} 集
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-card">
        <h2>道具 · {u.inventory.length}</h2>
        {u.inventory.length === 0 ? (
          <p className="admin-muted">背包为空。</p>
        ) : (
          <ul className="admin-chips">
            {u.inventory.map((it) => (
              <li key={it.itemId}>
                <code>{it.itemId}</code> ×{it.quantity}
              </li>
            ))}
          </ul>
        )}
      </section>

      {u.recentReports.length ? (
        <section className="admin-card">
          <h2>近期视频反馈</h2>
          <ul className="admin-report-mini">
            {u.recentReports.map((r) => (
              <li key={r.id}>
                <code>{r.courseId}</code> 第 {r.episodeN} 集 · {r.kind} ·{" "}
                {r.resolved ? "已处理" : "待处理"} · {fmt(r.createdAt)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
