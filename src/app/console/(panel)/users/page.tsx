import Link from "next/link";
import { Search } from "lucide-react";
import { adminListUsers } from "@/lib/admin/users";

export const metadata = { title: "用户" };
export const dynamic = "force-dynamic";

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page: pageStr } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);
  const { rows, total, pageSize } = await adminListUsers(q, page);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <h1>用户</h1>
        <p className="admin-muted">共 {total} 名用户。点进任意用户可调整进度与数值。</p>
      </header>

      <form className="admin-search" method="get">
        <Search size={16} aria-hidden />
        <input
          name="q"
          defaultValue={q}
          placeholder="搜索用户名 / 昵称 / id"
          autoComplete="off"
        />
        <button type="submit">搜索</button>
      </form>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>id</th>
              <th>用户名</th>
              <th>昵称</th>
              <th>等级</th>
              <th>金币</th>
              <th>注册</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="admin-muted">
                  没有匹配的用户。
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>
                    <Link href={`/console/users/${u.id}`}>{u.username}</Link>
                  </td>
                  <td>{u.displayName ?? "—"}</td>
                  <td>Lv.{u.level}</td>
                  <td>{u.coins}</td>
                  <td>{fmtDate(u.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="admin-pager">
          {page > 1 ? (
            <Link
              href={`/console/users?q=${encodeURIComponent(q)}&page=${page - 1}`}
            >
              ← 上一页
            </Link>
          ) : (
            <span className="is-disabled">← 上一页</span>
          )}
          <span>
            第 {page} / {pages} 页
          </span>
          {page < pages ? (
            <Link
              href={`/console/users?q=${encodeURIComponent(q)}&page=${page + 1}`}
            >
              下一页 →
            </Link>
          ) : (
            <span className="is-disabled">下一页 →</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
