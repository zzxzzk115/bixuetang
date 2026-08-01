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
  searchParams: Promise<{ subject?: string; level?: string; q?: string }>;
}) {
  const { subject, level, q } = await searchParams;
  const content = getContent();
  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;

  const needle = q?.trim().toLowerCase();
  const courses = content.courses.filter((c) => {
    if (subject && c.subject !== subject) return false;
    if (level && c.level !== level) return false;
    if (!needle) return true;
    return [c.title, c.code, c.institution, c.instructor, ...c.tags]
      .filter((s) => s !== undefined)
      .some((s) => s.toLowerCase().includes(needle));
  });

  const filterLink = (params: Record<string, string | undefined>) => {
    const merged = { subject, level, q, ...params };
    const qs = new URLSearchParams();
    if (merged.subject) qs.set("subject", merged.subject);
    if (merged.level) qs.set("level", merged.level);
    if (merged.q) qs.set("q", merged.q);
    const s = qs.toString();
    return s ? `/courses?${s}` : "/courses";
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">副本图鉴</h1>
      <p className="mt-1 text-sm text-muted">
        每门公开课都是一个副本：看完一集击败一只小怪，全部看完讨伐 Boss。
      </p>

      <form action="/courses" method="get" className="mt-5 flex max-w-md gap-2">
        {subject && <input type="hidden" name="subject" value={subject} />}
        {level && <input type="hidden" name="level" value={level} />}
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="搜索副本：课程名 / 编号 / 机构 / 标签……"
          className="w-full rounded border border-edge bg-panel px-3 py-1.5 text-sm outline-none focus:border-gold"
        />
        <button className="shrink-0 rounded border border-edge px-3 py-1.5 text-sm text-muted hover:border-gold hover:text-gold">
          🔍 搜索
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
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
