"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { markCourseWatched } from "@/lib/game/mark-watched-actions";
import { celebrate } from "@/lib/celebrate";

// 纯视频课「标记看过」入口:确认后直接算学完、解锁下一门(不发奖励)。
// 标记是有意义的状态变更,二次确认再执行。
export function MarkWatched({
  courseId,
  title,
}: {
  courseId: string;
  title: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const r = await markCourseWatched(courseId);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "操作失败");
      return;
    }
    celebrate({
      kind: "quest",
      title: "已标记看过",
      subtitle: `《${title}》记为学完,下一门解锁了`,
    });
    router.push("/play");
  };

  return (
    <section className="mark-watched">
      <span className="mark-watched-icon" aria-hidden>
        <CheckCheck size={20} />
      </span>
      <div className="mark-watched-body">
        <b>已经看过这门课?</b>
        <small>
          纯视频课没有测验;确认看过就标记完成,直接解锁下一门(不额外发经验)。
        </small>
        {err && <small className="mark-watched-err">{err}</small>}
      </div>
      {confirming ? (
        <span className="mark-watched-actions">
          <button className="app-btn-primary" onClick={go} disabled={busy}>
            {busy ? "…" : "确定"}
          </button>
          <button
            className="app-btn-plain"
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            取消
          </button>
        </span>
      ) : (
        <button
          className="app-btn-plain mark-watched-btn"
          onClick={() => setConfirming(true)}
        >
          标记看过
        </button>
      )}
    </section>
  );
}
