import Link from "next/link";
import { notFound } from "next/navigation";
import { LevelBadge, SubjectBadge } from "@/components/badges";
import { EmbedPlayer } from "@/components/embed-player";
import { EpisodeList } from "@/components/episode-list";
import { StatusButtons } from "@/components/status-buttons";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getUserProgress } from "@/lib/progress/queries";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const content = getContent();
  const course = content.coursesById.get(id);
  if (!course) notFound();

  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;
  const watched = progress?.watchedByCourse.get(id);
  const status = progress?.statusByCourse.get(id) ?? null;

  const prereqs = course.prerequisites
    .map((p) => content.coursesById.get(p))
    .filter((c) => c !== undefined);
  const inPaths = content.paths.filter((p) =>
    p.stages.some((s) => s.courses.includes(id)),
  );
  const relatedSkills = content.skillNodes.filter((n) =>
    n.courses.includes(id),
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{course.title}</h1>
            <LevelBadge level={course.level} />
            <SubjectBadge subject={course.subject} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {course.code}
            {course.institution ? ` · ${course.institution}` : ""}
            {course.instructor ? ` · ${course.instructor}` : ""}
            {course.estimatedHours ? ` · 约 ${course.estimatedHours} 小时` : ""}
          </p>
        </div>

        <EmbedPlayer sources={course.sources} />

        {course.description && (
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted">
            {course.description}
          </p>
        )}

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">⚔️ 讨伐小怪（集数清单）</h2>
            <StatusButtons courseId={id} current={status} loggedIn={!!user} />
          </div>
          <EpisodeList
            courseId={id}
            episodes={course.episodes}
            watched={watched ? [...watched] : []}
            loggedIn={!!user}
          />
        </div>
      </div>

      <aside className="space-y-5">
        {prereqs.length > 0 && (
          <section className="rounded-lg border border-edge bg-panel p-4">
            <h3 className="mb-2 text-sm font-bold text-muted">⛓️ 前置副本</h3>
            <ul className="space-y-1.5">
              {prereqs.map((p) => {
                const done = progress?.statusByCourse.get(p.id) === "done";
                return (
                  <li key={p.id}>
                    <Link
                      href={`/courses/${p.id}`}
                      className="text-sm text-foreground hover:text-gold"
                    >
                      {done ? "✅" : "⬜"} {p.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {course.notes.length > 0 && (
          <section className="rounded-lg border border-edge bg-panel p-4">
            <h3 className="mb-2 text-sm font-bold text-muted">
              📜 冒险者笔记（社区分享）
            </h3>
            <ul className="space-y-1.5">
              {course.notes.map((n, i) => (
                <li key={i}>
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sm text-foreground hover:text-gold"
                  >
                    {n.kind === "github" ? "🐙" : "🔗"} {n.title} ↗
                  </a>
                  {n.author && (
                    <span className="ml-1 text-xs text-muted">
                      by {n.author}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {relatedSkills.length > 0 && (
          <section className="rounded-lg border border-edge bg-panel p-4">
            <h3 className="mb-2 text-sm font-bold text-muted">✨ 可点亮技能</h3>
            <ul className="space-y-1.5 text-sm">
              {relatedSkills.map((n) => (
                <li key={n.id}>
                  <span className="text-gold">◆</span> {n.title}
                  <span className="ml-1 text-xs text-muted">
                    T{n.tier} · 需 {n.cost} 技能点
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">技能树系统即将开放</p>
          </section>
        )}

        {inPaths.length > 0 && (
          <section className="rounded-lg border border-edge bg-panel p-4">
            <h3 className="mb-2 text-sm font-bold text-muted">🗺️ 所属路径</h3>
            <ul className="space-y-1.5">
              {inPaths.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/paths/${p.id}`}
                    className="text-sm text-foreground hover:text-gold"
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
