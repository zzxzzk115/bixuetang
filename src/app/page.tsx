import Link from "next/link";
import { SUBJECT_ICON } from "@/components/badges";
import { XpBar } from "@/components/xp-bar";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { SUBJECT_LABEL, SUBJECTS } from "@/lib/content/schema";
import { getUserProgress } from "@/lib/progress/queries";

export default async function HomePage() {
  const content = getContent();
  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;

  // 「继续冒险」：最近在学、且未打完的副本
  const continueCourses = progress
    ? [...progress.statusByCourse.entries()]
        .filter(([, s]) => s === "learning")
        .map(([id]) => content.coursesById.get(id))
        .filter((c) => c !== undefined)
        .slice(0, 3)
    : [];

  return (
    <div className="space-y-10">
      <section className="rounded-lg border border-edge bg-panel p-8 text-center">
        <h1 className="text-3xl font-bold">
          把公开课变成<span className="text-gold">副本</span>，把自学变成
          <span className="text-gold">升级打怪</span>
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-muted">
          精选 bilibili / YouTube 上的世界名校理科公开课，整理成由浅入深的冒险路径。
          看完一集击败一只小怪，通关一门课讨伐一只
          Boss，升级、点技能、转职——让变强看得见。
        </p>
        {!user && (
          <Link
            href="/register"
            className="mt-6 inline-block rounded border border-gold px-6 py-2.5 font-bold text-gold hover:bg-gold hover:text-background"
          >
            创建角色，开始冒险 →
          </Link>
        )}
      </section>

      {progress && user && (
        <section className="rounded-lg border border-edge bg-panel p-5">
          <div className="flex flex-wrap items-center gap-6">
            <div className="min-w-48 flex-1">
              <p className="mb-1 text-sm text-muted">
                {user.displayName || user.username} 的冒险
              </p>
              <XpBar level={progress.level} />
            </div>
            {continueCourses.length > 0 && (
              <div className="flex-1">
                <p className="mb-2 text-sm text-muted">继续冒险</p>
                <div className="flex flex-wrap gap-2">
                  {continueCourses.map((c) => {
                    const watched =
                      progress.watchedByCourse.get(c.id)?.size ?? 0;
                    return (
                      <Link
                        key={c.id}
                        href={`/courses/${c.id}`}
                        className="rounded border border-edge bg-panel-hover px-3 py-1.5 text-sm hover:border-gold"
                      >
                        {c.title}
                        <span className="ml-2 text-xs text-muted">
                          {watched}/{c.episodes.length}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-xl font-bold">四大修行方向</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {SUBJECTS.map((s) => {
            const count = content.courses.filter((c) => c.subject === s).length;
            return (
              <Link
                key={s}
                href={`/courses?subject=${s}`}
                className="rounded-lg border border-edge bg-panel p-5 text-center transition-colors hover:border-gold hover:bg-panel-hover"
              >
                <div className="text-3xl">{SUBJECT_ICON[s]}</div>
                <div className="mt-2 font-bold">{SUBJECT_LABEL[s]}</div>
                <div className="mt-1 text-xs text-muted">{count} 个副本</div>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">冒险路径</h2>
          <Link href="/paths" className="text-sm text-gold hover:underline">
            全部路径 →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {content.paths.map((p) => (
            <Link
              key={p.id}
              href={`/paths/${p.id}`}
              className="rounded-lg border border-edge bg-panel p-5 transition-colors hover:border-gold hover:bg-panel-hover"
            >
              <div className="flex items-center gap-2 font-bold">
                {SUBJECT_ICON[p.subject]} {p.title}
              </div>
              <p className="mt-1.5 text-sm text-muted">{p.description}</p>
              <p className="mt-2 text-xs text-muted">
                {p.stages.length} 章 ·{" "}
                {p.stages.reduce((n, s) => n + s.courses.length, 0)} 个副本
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
