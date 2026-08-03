import Link from "next/link";
import { notFound } from "next/navigation";
import { LevelBadge, StatusBadge } from "@/components/badges";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { SUBJECT_LABEL, type Course } from "@/lib/content/schema";
import { getUserProgress, type UserProgress } from "@/lib/progress/queries";

// 关卡地图布局常量
const W = 640;
const ROW_H = 138;
const BANNER_H = 76;
const NODE_R = 30;
const LEFT_X = 110;
const RIGHT_X = W - 110;

type MapRow =
  | { type: "banner"; title: string; y: number }
  | { type: "course"; course: Course; x: number; y: number; isFinal: boolean };

function buildRows(
  stages: { title: string; courses: string[] }[],
  coursesById: Map<string, Course>,
): { rows: MapRow[]; height: number } {
  const rows: MapRow[] = [];
  let y = 0;
  let slot = 0;
  const total = stages.reduce((n, s) => n + s.courses.length, 0);
  let seen = 0;
  for (const stage of stages) {
    rows.push({ type: "banner", title: stage.title, y: y + BANNER_H / 2 });
    y += BANNER_H;
    for (const cid of stage.courses) {
      seen++;
      rows.push({
        type: "course",
        course: coursesById.get(cid)!,
        x: slot % 2 === 0 ? LEFT_X : RIGHT_X,
        y: y + ROW_H / 2,
        isFinal: seen === total,
      });
      slot++;
      y += ROW_H;
    }
  }
  return { rows, height: y };
}

function nodeState(
  course: Course,
  progress: UserProgress | null,
  currentId: string | null,
) {
  const status = progress?.statusByCourse.get(course.id) ?? null;
  const watched = progress?.watchedByCourse.get(course.id)?.size ?? 0;
  const done = status === "done";
  return {
    status,
    watched,
    done,
    isCurrent: course.id === currentId,
    pct: Math.round((watched / course.episodes.length) * 100),
  };
}

export default async function PathPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const content = getContent();
  const path = content.pathsById.get(id);
  if (!path) notFound();

  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;

  const { rows, height } = buildRows(path.stages, content.coursesById);
  const courseRows = rows.filter((r) => r.type === "course");
  // 当前关卡 = 路径顺序上第一门未通关的课
  const currentId =
    progress === null
      ? null
      : (courseRows.find(
          (r) => progress.statusByCourse.get(r.course.id) !== "done",
        )?.course.id ?? null);
  const doneCount = progress
    ? courseRows.filter(
        (r) => progress.statusByCourse.get(r.course.id) === "done",
      ).length
    : 0;

  return (
    <div className="page-stack mx-auto max-w-4xl">
      <header className="page-intro">
        <div>
          <p className="page-kicker">CAMPAIGN MAP // {SUBJECT_LABEL[path.subject]}</p>
          <h1 className="page-title">{path.title}</h1>
          {path.description && (
            <p className="mt-1.5 text-sm text-muted">{path.description}</p>
          )}
        </div>
        {progress && (
          <span className="border border-edge bg-panel px-3 py-1.5 font-mono text-xs">
            通关{" "}
            <b className={doneCount === courseRows.length ? "text-gold" : ""}>
              {doneCount}
            </b>{" "}
            / {courseRows.length}
          </span>
        )}
      </header>

      <div className="path-map py-6">
        <div className="relative mx-auto" style={{ width: W, height }}>
          {/* 蜿蜒道路 */}
          <svg className="absolute inset-0" width={W} height={height}>
            {courseRows.map((r, i) => {
              if (i === 0) return null;
              const prev = courseRows[i - 1];
              const y1 = prev.y + NODE_R;
              const y2 = r.y - NODE_R;
              const mid = (y1 + y2) / 2;
              const done =
                progress?.statusByCourse.get(prev.course.id) === "done";
              return (
                <path
                  key={i}
                  d={`M ${prev.x} ${y1} C ${prev.x} ${mid}, ${r.x} ${mid}, ${r.x} ${y2}`}
                  fill="none"
                  stroke={done ? "var(--gold)" : "var(--edge)"}
                  strokeWidth="3"
                  strokeDasharray={done ? "none" : "7 7"}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {rows.map((row, ri) => {
            if (row.type === "banner") {
              return (
                <div
                  key={ri}
                  className="absolute flex w-full justify-center"
                  style={{ top: row.y - 14 }}
                >
                  <span className="path-stage border border-edge bg-panel px-4 py-1 font-mono text-xs font-bold text-muted">
                    {row.title}
                  </span>
                </div>
              );
            }
            const s = nodeState(row.course, progress, currentId);
            const sequence = courseRows.findIndex((item) => item.course.id === row.course.id) + 1;
            const icon = s.done ? "✓" : row.isFinal ? "B" : String(sequence).padStart(2, "0");
            const cardLeft = row.x === LEFT_X ? LEFT_X + NODE_R + 18 : 16;
            const cardWidth = W - NODE_R * 2 - 110 - 40;
            return (
              <div key={ri}>
                {/* 关卡节点 */}
                <Link
                  href={`/courses/${row.course.id}`}
                  className={`path-node absolute flex items-center justify-center border-2 font-mono text-[10px] font-bold transition-transform hover:scale-110 ${
                    s.done
                      ? "border-gold bg-amber-100 text-gold dark:bg-amber-950"
                      : s.isCurrent
                        ? "animate-glow border-gold bg-panel"
                        : "border-edge bg-panel opacity-80"
                  }`}
                  style={{
                    left: row.x - NODE_R,
                    top: row.y - NODE_R,
                    width: NODE_R * 2,
                    height: NODE_R * 2,
                  }}
                >
                  {icon}
                </Link>
                {/* 课程卡 */}
                <Link
                  href={`/courses/${row.course.id}`}
                  className={`path-course-card absolute block border p-3 transition-colors hover:border-gold ${
                    s.isCurrent
                      ? "border-gold bg-panel"
                      : "border-edge bg-panel"
                  }`}
                  style={{ left: cardLeft, top: row.y - 44, width: cardWidth }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">
                      {row.course.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <LevelBadge level={row.course.level} />
                      {s.status && <StatusBadge status={s.status} />}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {row.course.code} · {row.course.episodes.length} 集
                    {s.isCurrent && (
                      <span className="ml-1.5 text-gold">← 当前关卡</span>
                    )}
                  </div>
                  {progress && s.watched > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-edge">
                      <div
                        className={`h-full ${s.pct >= 100 ? "bg-gold" : "bg-hp"}`}
                        style={{ width: `${s.pct}%` }}
                      />
                    </div>
                  )}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
