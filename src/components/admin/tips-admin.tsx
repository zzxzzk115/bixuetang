"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { adminDeleteTip, type AdminTipRow } from "@/lib/game/tips-actions";

// 运营审核课程心得(UGC):敏感词库只拦已收录的词,漏网/不当但未入库的靠这里人工下架。
// 下架不可撤销,点一下要二次确认。

function fmt(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function TipsAdmin({ initial }: { initial: AdminTipRow[] }) {
  const [rows, setRows] = useState(initial);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(id: number) {
    const snapshot = rows;
    setRows((rs) => rs.filter((r) => r.id !== id));
    setConfirmId(null);
    startTransition(async () => {
      const res = await adminDeleteTip(id);
      if (!res.ok) setRows(snapshot); // 失败回滚
    });
  }

  if (rows.length === 0) {
    return <p className="me-note">还没有任何课程心得。</p>;
  }

  return (
    <section className="course-card">
      <div className="course-card-head">
        <h2>全部心得 · {rows.length}</h2>
      </div>
      <ul className="report-list">
        {rows.map((r) => (
          <li key={r.id} className="report-row">
            <div className="report-main">
              <b>{r.text}</b>
              <div className="report-meta">
                <span>@{r.username}</span>
                <Link href={`/courses/${r.courseId}`} className="admin-link">
                  {r.courseTitle}
                </Link>
                <span>{fmt(r.createdAt)}</span>
              </div>
            </div>
            <div className="report-actions">
              {confirmId === r.id ? (
                <>
                  <button
                    type="button"
                    className="report-danger"
                    disabled={pending}
                    onClick={() => remove(r.id)}
                  >
                    确认下架
                  </button>
                  <button
                    type="button"
                    className="app-btn-plain"
                    disabled={pending}
                    onClick={() => setConfirmId(null)}
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="app-btn-plain"
                  onClick={() => setConfirmId(r.id)}
                >
                  <Trash2 size={14} aria-hidden /> 下架
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
