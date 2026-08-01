import Link from "next/link";
import { SUBJECT_ICON } from "@/components/badges";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getUserProgress } from "@/lib/progress/queries";

export const metadata = { title: "冒险路径" };

export default async function PathsPage() {
  const content = getContent();
  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;

  return (
    <div>
      <h1 className="text-2xl font-bold">冒险路径</h1>
      <p className="mt-1 text-sm text-muted">
        由社区公认的学习路线整理而成，按章节推进、由浅入深。
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {content.paths.map((p) => {
          const all = p.stages.flatMap((s) => s.courses);
          const doneCount = progress
            ? all.filter((c) => progress.statusByCourse.get(c) === "done")
                .length
            : 0;
          return (
            <Link
              key={p.id}
              href={`/paths/${p.id}`}
              className="rounded-lg border border-edge bg-panel p-5 transition-colors hover:border-gold hover:bg-panel-hover"
            >
              <div className="flex items-center gap-2 text-lg font-bold">
                {SUBJECT_ICON[p.subject]} {p.title}
              </div>
              <p className="mt-1.5 text-sm text-muted">{p.description}</p>
              <div className="mt-3 flex items-center gap-3 text-xs text-muted">
                <span>{p.stages.length} 章</span>
                <span>{all.length} 个副本</span>
                {progress && (
                  <span className={doneCount === all.length ? "text-gold" : ""}>
                    已通关 {doneCount}/{all.length}
                  </span>
                )}
              </div>
              {progress && doneCount > 0 && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-edge">
                  <div
                    className="h-full bg-gold"
                    style={{ width: `${(doneCount / all.length) * 100}%` }}
                  />
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
