"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, RotateCcw } from "lucide-react";
import {
  setReportResolved,
  type VideoReportRow,
} from "@/lib/game/report-actions";

// 运营看反馈:未处理在前。每条能跳课程页复核、标记已处理/重新打开。
// 破坏性不强(只是翻转 resolved),不加二次确认;误点了再翻回来即可。

const KIND_LABEL: Record<string, string> = {
  gone: "打不开",
  wrong: "内容不对",
  other: "其他",
};

function fmt(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ReportsAdmin({ initial }: { initial: VideoReportRow[] }) {
  const [rows, setRows] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle(id: number, resolved: boolean) {
    // 乐观更新,失败回滚
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, resolved } : r)));
    startTransition(async () => {
      const res = await setReportResolved(id, resolved);
      if (!res.ok)
        setRows((rs) =>
          rs.map((r) => (r.id === id ? { ...r, resolved: !resolved } : r)),
        );
    });
  }

  const open = rows.filter((r) => !r.resolved);
  const closed = rows.filter((r) => r.resolved);

  if (rows.length === 0) {
    return <p className="me-note">还没有任何视频失效反馈。</p>;
  }

  const card = (r: VideoReportRow) => (
    <li key={r.id} className={`report-row${r.resolved ? " is-resolved" : ""}`}>
      <div className="report-main">
        <b>
          {r.courseTitle} · 第 {r.episodeN} 集
        </b>
        <small>{r.episodeTitle}</small>
        <div className="report-meta">
          <span className={`report-kind report-kind-${r.kind}`}>
            {KIND_LABEL[r.kind] ?? r.kind}
          </span>
          <code>{r.bvid}</code>
          <span>@{r.reporter}</span>
          <span>{fmt(r.createdAt)}</span>
        </div>
        {r.note ? <p className="report-note">{r.note}</p> : null}
      </div>
      <div className="report-actions">
        <a
          className="app-btn-plain"
          href={`/courses/${r.courseId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          复核 <ExternalLink size={13} aria-hidden />
        </a>
        {r.resolved ? (
          <button
            type="button"
            className="app-btn-plain"
            disabled={pending}
            onClick={() => toggle(r.id, false)}
          >
            <RotateCcw size={14} aria-hidden /> 重新打开
          </button>
        ) : (
          <button
            type="button"
            className="report-resolve"
            disabled={pending}
            onClick={() => toggle(r.id, true)}
          >
            <Check size={15} aria-hidden /> 标记已处理
          </button>
        )}
      </div>
    </li>
  );

  return (
    <>
      <section className="course-card">
        <div className="course-card-head">
          <h2>待处理 · {open.length}</h2>
        </div>
        {open.length ? (
          <ul className="report-list">{open.map(card)}</ul>
        ) : (
          <p className="me-note">没有待处理的反馈 🎉</p>
        )}
      </section>
      {closed.length ? (
        <section className="course-card">
          <div className="course-card-head">
            <h2>已处理 · {closed.length}</h2>
          </div>
          <ul className="report-list">{closed.map(card)}</ul>
        </section>
      ) : null}
    </>
  );
}
