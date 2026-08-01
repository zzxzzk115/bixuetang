import Link from "next/link";
import {
  LevelBadge,
  StatusBadge,
  SubjectBadge,
} from "@/components/badges";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import {
  LEVEL_LABEL,
  LEVELS,
  SUBJECT_LABEL,
  SUBJECTS,
  type Level,
  type Subject,
} from "@/lib/content/schema";
import { getUserProgress } from "@/lib/progress/queries";

export const metadata = { title: "副本图鉴" };

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; level?: string }>;
}) {
  const { subject, level } = await searchParams;
  const content = getContent();
  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;

  const courses = content.courses.filter(
    (c) =>
      (!subject || c.subject === subject) && (!level || c.level === level),
  );

  const filterLink = (params: Record<string, string | undefined>) => {
    const merged = { subject, level, ...params };
    const qs = new URLSearchParams();
    if (merged.subject) qs.set("subject", merged.subject);
    if (merged.level) qs.set("level", merged.level);
    const s = qs.toString();
    return s ? `/courses?${s}` : "/courses";
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">副本图鉴</h1>
      <p className="mt-1 text-sm text-muted">
        每门公开课都是一个副本：看完一集击败一只小怪，全部看完讨伐 Boss。
      </p>

      <div className="mt-5 flex flex-wrap gap-4 text-sm">
        <div className="flex gap-1.5">
          <Link
            href={filterLink({ subject: undefined })}
            className={`rounded px-2.5 py-1 ${!subject ? "bg-gold font-bold text-background" : "bg-panel text-muted hover:text-foreground"}`}
          >
            全部
          </Link>
          {SUBJECTS.map((s) => (
            <Link
              key={s}
              href={filterLink({ subject: s })}
              className={`rounded px-2.5 py-1 ${subject === s ? "bg-gold font-bold text-background" : "bg-panel text-muted hover:text-foreground"}`}
            >
              {SUBJECT_LABEL[s as Subject]}
            </Link>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Link
            href={filterLink({ level: undefined })}
            className={`rounded px-2.5 py-1 ${!level ? "bg-edge font-bold" : "bg-panel text-muted hover:text-foreground"}`}
          >
            全部难度
          </Link>
          {LEVELS.map((l) => (
            <Link
              key={l}
              href={filterLink({ level: l })}
              className={`rounded px-2.5 py-1 ${level === l ? "bg-edge font-bold" : "bg-panel text-muted hover:text-foreground"}`}
            >
              {LEVEL_LABEL[l as Level]}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((c) => {
          const status = progress?.statusByCourse.get(c.id) ?? null;
          const watched = progress?.watchedByCourse.get(c.id)?.size ?? 0;
          const pct = Math.round((watched / c.episodes.length) * 100);
          return (
            <Link
              key={c.id}
              href={`/courses/${c.id}`}
              className="flex flex-col rounded-lg border border-edge bg-panel p-4 transition-colors hover:border-gold hover:bg-panel-hover"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold">{c.title}</div>
                {status && <StatusBadge status={status} />}
              </div>
              <div className="mt-1 text-xs text-muted">
                {c.code} {c.institution ? `· ${c.institution}` : ""}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <SubjectBadge subject={c.subject} />
                <LevelBadge level={c.level} />
                <span className="text-xs text-muted">
                  {c.episodes.length} 集
                </span>
              </div>
              {progress && watched > 0 && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-edge">
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
      {courses.length === 0 && (
        <p className="mt-10 text-center text-muted">该筛选下暂无副本</p>
      )}
    </div>
  );
}
