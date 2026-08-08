"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminForceUnlock,
  adminGiveItem,
  adminGrantXp,
  adminMarkCourseComplete,
  adminResetCourse,
  adminSetCoins,
  adminSetCourseStatus,
  adminSetShieldHearts,
  type AdminActionResult,
} from "@/lib/admin/actions";

// 课程状态(硬编码,避免把 schema/drizzle 拉进客户端包)
const STATUSES: { value: "planned" | "learning" | "done" | "dropped"; label: string }[] = [
  { value: "planned", label: "计划中" },
  { value: "learning", label: "学习中" },
  { value: "done", label: "已完成" },
  { value: "dropped", label: "已放弃" },
];

export function AdminUserTools({
  userId,
  courses,
}: {
  userId: number;
  courses: { courseId: string; title: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // XP / 金币 / 护盾 / 道具 表单值
  const [xp, setXp] = useState("");
  const [coins, setCoins] = useState("");
  const [shield, setShield] = useState("");
  const [itemId, setItemId] = useState("");
  const [itemQty, setItemQty] = useState("");
  // 进度
  const [courseId, setCourseId] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]["value"]>("done");

  function run(fn: () => Promise<AdminActionResult>) {
    startTransition(async () => {
      const r = await fn();
      setMsg({ text: r.ok ? (r.message ?? "已完成") : (r.error ?? "失败"), ok: r.ok });
      if (r.ok) router.refresh();
    });
  }

  return (
    <>
      <section className="admin-card">
        <h2>数值调整</h2>
        <div className="admin-tools">
          <div className="admin-tool-row">
            <input
              type="number"
              placeholder="XP 增减(可负)"
              value={xp}
              onChange={(e) => setXp(e.target.value)}
            />
            <button
              disabled={pending || !xp}
              onClick={() => run(() => adminGrantXp(userId, Number(xp)))}
            >
              增减 XP
            </button>
          </div>
          <div className="admin-tool-row">
            <input
              type="number"
              min={0}
              placeholder="金币(绝对值)"
              value={coins}
              onChange={(e) => setCoins(e.target.value)}
            />
            <button
              disabled={pending || coins === ""}
              onClick={() => run(() => adminSetCoins(userId, Number(coins)))}
            >
              设为
            </button>
          </div>
          <div className="admin-tool-row">
            <input
              type="number"
              min={0}
              max={3}
              placeholder="护盾 0–3"
              value={shield}
              onChange={(e) => setShield(e.target.value)}
            />
            <button
              disabled={pending || shield === ""}
              onClick={() => run(() => adminSetShieldHearts(userId, Number(shield)))}
            >
              设护盾
            </button>
          </div>
          <div className="admin-tool-row">
            <input
              placeholder="道具 id(如 cs-boss)"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
            />
            <input
              type="number"
              placeholder="数量增减"
              value={itemQty}
              onChange={(e) => setItemQty(e.target.value)}
            />
            <button
              disabled={pending || !itemId || !itemQty}
              onClick={() => run(() => adminGiveItem(userId, itemId, Number(itemQty)))}
            >
              发放
            </button>
          </div>
        </div>
      </section>

      <section className="admin-card">
        <h2>进度与解锁</h2>
        <div className="admin-tools">
          <div className="admin-tool-row">
            <input
              list="admin-course-list"
              placeholder="课程 id"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            />
            <datalist id="admin-course-list">
              {courses.map((c) => (
                <option key={c.courseId} value={c.courseId}>
                  {c.title}
                </option>
              ))}
            </datalist>
          </div>
          <div className="admin-tool-row">
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as (typeof STATUSES)[number]["value"])
              }
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              disabled={pending || !courseId}
              onClick={() => run(() => adminSetCourseStatus(userId, courseId, status))}
            >
              设状态
            </button>
          </div>
          <div className="admin-tool-row admin-tool-actions">
            <button
              disabled={pending || !courseId}
              onClick={() => run(() => adminMarkCourseComplete(userId, courseId))}
            >
              标记全部完成
            </button>
            <button
              disabled={pending || !courseId}
              onClick={() => run(() => adminForceUnlock(userId, courseId))}
            >
              强制解锁
            </button>
            <button
              className="admin-danger"
              disabled={pending || !courseId}
              onClick={() => {
                if (
                  confirm(`确定清除该用户在「${courseId}」的全部进度?此操作不可撤销。`)
                ) {
                  run(() => adminResetCourse(userId, courseId));
                }
              }}
            >
              重置进度
            </button>
          </div>
        </div>
        {msg ? (
          <p className={msg.ok ? "admin-auth-ok" : "admin-auth-error"}>
            {msg.text}
          </p>
        ) : null}
      </section>
    </>
  );
}
