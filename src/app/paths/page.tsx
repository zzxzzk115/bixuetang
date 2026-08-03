import Link from "next/link";
import { SubjectIcon } from "@/components/badges";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getUserProgress } from "@/lib/progress/queries";

export const metadata = { title: "远征路径" };

export default async function PathsPage() {
  const content = getContent();
  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;

  return (
    <div className="page-stack">
      <header className="page-intro">
        <div>
          <p className="page-kicker">CAMPAIGN ROUTES</p>
          <h1 className="page-title">远征路径</h1>
          <p className="page-lead">
            从社区高质量课程清单中整理出的完整战役线。每条路径按章节推进，
            前段建立战斗能力，后段进入专业领域与高阶副本。
          </p>
        </div>
        <div className="font-mono text-xs text-muted">
          ROUTES <b className="text-gold">{content.paths.length}</b>
        </div>
      </header>

      <section>
        <div className="section-heading">
          <span>战役任务板</span>
        </div>
        <div className="quest-board">
          {content.paths.map((path, index) => {
            const all = path.stages.flatMap((stage) => stage.courses);
            const doneCount = progress
              ? all.filter(
                  (courseId) =>
                    progress.statusByCourse.get(courseId) === "done",
                ).length
              : 0;
            const pct =
              all.length === 0 ? 0 : Math.round((doneCount / all.length) * 100);
            return (
              <Link
                key={path.id}
                href={`/paths/${path.id}`}
                className="quest-row"
              >
                <span className="quest-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <b>{path.title}</b>
                    <span className="quest-meta">
                      <SubjectIcon subject={path.subject} /> · {path.stages.length} 章 ·{" "}
                      {all.length} 副本
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {path.description}
                  </span>
                  {progress && (
                    <span className="mt-2 block max-w-sm">
                      <span className="progress-track block">
                        <span
                          className={`progress-fill block ${pct >= 100 ? "complete" : ""}`}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="quest-meta mt-1 block">
                        攻略进度 {doneCount}/{all.length} · {pct}%
                      </span>
                    </span>
                  )}
                </span>
                <span className="quest-arrow">›</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
