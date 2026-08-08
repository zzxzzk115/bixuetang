"use client";

import { useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import {
  setCareerSuggestionResolved,
  type CareerSuggestionRow,
} from "@/lib/game/goal-actions";

// 运营看「其他 · 我想成为…」的职业建议:未处理在前。考虑是否新增「成为 X」路线,
// 处理完标记(采纳或忽略都算已处理)。只翻转 resolved,误点再翻回来即可。

function fmt(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function CareerSuggestionsAdmin({
  initial,
}: {
  initial: CareerSuggestionRow[];
}) {
  const [rows, setRows] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle(id: number, resolved: boolean) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, resolved } : r)));
    startTransition(async () => {
      const res = await setCareerSuggestionResolved(id, resolved);
      if (!res.ok)
        setRows((rs) =>
          rs.map((r) => (r.id === id ? { ...r, resolved: !resolved } : r)),
        );
    });
  }

  if (rows.length === 0) {
    return <p className="me-note">还没有任何职业目标建议。</p>;
  }

  const open = rows.filter((r) => !r.resolved);
  const closed = rows.filter((r) => r.resolved);

  const card = (r: CareerSuggestionRow) => (
    <li key={r.id} className={`report-row${r.resolved ? " is-resolved" : ""}`}>
      <div className="report-main">
        <b>{r.text}</b>
        <div className="report-meta">
          <span>@{r.username}</span>
          <span>{fmt(r.createdAt)}</span>
        </div>
      </div>
      <div className="report-actions">
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
          <p className="me-note">没有待处理的建议 🎉</p>
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
