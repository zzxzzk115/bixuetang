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

export const metadata = { title: "副本档案" };

const THREAT: Record<Level, string> = {
  basic: "I",
  intermediate: "II",
  advanced: "III",
};

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
  const courses = content.courses.filter((course) => {
    if (subject && course.subject !== subject) return false;
    if (level && course.level !== level) return false;
    if (!needle) return true;
    return [
      course.title,
      course.code,
      course.institution,
      course.instructor,
      ...course.tags,
    ]
      .filter((value) => value !== undefined)
      .some((value) => value.toLowerCase().includes(needle));
  });

  const filterLink = (params: Record<string, string | undefined>) => {
    const merged = { subject, level, q, ...params };
    const query = new URLSearchParams();
    if (merged.subject) query.set("subject", merged.subject);
    if (merged.level) query.set("level", merged.level);
    if (merged.q) query.set("q", merged.q);
    const value = query.toString();
    return value ? `/courses?${value}` : "/courses";
  };

  return (
    <div className="page-stack">
      <header className="page-intro">
        <div>
          <p className="page-kicker">DUNGEON ARCHIVE</p>
          <h1 className="page-title">副本档案</h1>
          <p className="page-lead">
            公开课不再只是链接。每一集是一场遭遇，完整课程是一座有前置条件、
            威胁等级、战利品技能与 Boss 结算的知识地下城。
          </p>
        </div>
        <div className="font-mono text-xs text-muted">
          MATCHED <b className="text-gold">{courses.length}</b> /{" "}
          {content.courses.length}
        </div>
      </header>

      <form action="/courses" method="get" className="filter-console">
        <div className="flex gap-2">
          {subject && <input type="hidden" name="subject" value={subject} />}
          {level && <input type="hidden" name="level" value={level} />}
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="搜索课程名、编号、机构、讲师或标签"
            className="min-w-0 flex-1 px-3 text-sm outline-none"
          />
          <button className="command-button">检索档案</button>
        </div>

        <div className="filter-options">
          <div className="filter-group">
            <Link
              href={filterLink({ subject: undefined })}
              className={`filter-chip ${!subject ? "active" : ""}`}
            >
              全分部
            </Link>
            {SUBJECTS.map((value) => (
              <Link
                key={value}
                href={filterLink({ subject: value })}
                className={`filter-chip ${subject === value ? "active" : ""}`}
              >
                {SUBJECT_LABEL[value as Subject]}
              </Link>
            ))}
          </div>
          <div className="filter-group">
            <Link
              href={filterLink({ level: undefined })}
              className={`filter-chip ${!level ? "active" : ""}`}
            >
              全威胁等级
            </Link>
            {LEVELS.map((value) => (
              <Link
                key={value}
                href={filterLink({ level: value })}
                className={`filter-chip ${level === value ? "active" : ""}`}
              >
                {LEVEL_LABEL[value as Level]}
              </Link>
            ))}
          </div>
        </div>
      </form>

      <section>
        <div className="section-heading">
          <span>可进入副本</span>
        </div>
        <div className="dungeon-grid">
          {courses.map((course) => {
            const status = progress?.statusByCourse.get(course.id) ?? null;
            const watched =
              progress?.watchedByCourse.get(course.id)?.size ?? 0;
            const pct = Math.round(
              (watched / course.episodes.length) * 100,
            );
            return (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="dungeon-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="dungeon-code">
                    DGN-{course.subject.toUpperCase()} · THREAT{" "}
                    {THREAT[course.level]}
                  </span>
                  {status && <StatusBadge status={status} />}
                </div>
                <h2 className="dungeon-title">{course.title}</h2>
                <p className="mt-1 text-xs text-muted">
                  {course.code}
                  {course.institution ? ` · ${course.institution}` : ""}
                </p>
                <div className="dungeon-meta">
                  <SubjectBadge subject={course.subject} />
                  <LevelBadge level={course.level} />
                  <span>{course.episodes.length} 遭遇</span>
                </div>
                {progress && watched > 0 && (
                  <div className="mt-3">
                    <div className="progress-track">
                      <div
                        className={`progress-fill ${pct >= 100 ? "complete" : ""}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="quest-meta mt-1">
                      攻略 {watched}/{course.episodes.length} · {pct}%
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
        {courses.length === 0 && (
          <p className="hud-panel p-8 text-center text-sm text-muted">
            当前检索条件下没有可进入的副本。
          </p>
        )}
      </section>
    </div>
  );
}
