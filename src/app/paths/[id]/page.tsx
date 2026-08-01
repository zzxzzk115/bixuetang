import Link from "next/link";
import { notFound } from "next/navigation";
import { LevelBadge, StatusBadge, SUBJECT_ICON } from "@/components/badges";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getUserProgress } from "@/lib/progress/queries";

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

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2 text-2xl font-bold">
        {SUBJECT_ICON[path.subject]} {path.title}
      </div>
      {path.description && (
        <p className="mt-1.5 text-sm text-muted">{path.description}</p>
      )}

      <div className="mt-8 space-y-8">
        {path.stages.map((stage, si) => (
          <section key={si} className="relative pl-8">
            {/* 章节连线 */}
            {si < path.stages.length - 1 && (
              <div className="absolute left-[11px] top-8 h-full w-0.5 bg-edge" />
            )}
            <div className="absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-gold bg-panel text-xs font-bold text-gold">
              {si + 1}
            </div>
            <h2 className="font-bold">{stage.title}</h2>
            <div className="mt-3 space-y-2.5">
              {stage.courses.map((cid) => {
                const c = content.coursesById.get(cid)!;
                const status = progress?.statusByCourse.get(cid) ?? null;
                const watched = progress?.watchedByCourse.get(cid)?.size ?? 0;
                const pct = Math.round((watched / c.episodes.length) * 100);
                return (
                  <Link
                    key={cid}
                    href={`/courses/${cid}`}
                    className="block rounded-lg border border-edge bg-panel p-4 transition-colors hover:border-gold hover:bg-panel-hover"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold">{c.title}</div>
                      <div className="flex items-center gap-2">
                        <LevelBadge level={c.level} />
                        {status && <StatusBadge status={status} />}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {c.code} · {c.episodes.length} 集
                      {c.estimatedHours ? ` · 约 ${c.estimatedHours} 小时` : ""}
                    </div>
                    {progress && watched > 0 && (
                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-edge">
                        <div
                          className={`h-full ${pct >= 100 ? "bg-gold" : "bg-hp"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
