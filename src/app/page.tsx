import Link from "next/link";
import { SubjectIcon } from "@/components/badges";
import { XpBar } from "@/components/xp-bar";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { SUBJECT_LABEL, SUBJECTS } from "@/lib/content/schema";
import { getUserProgress } from "@/lib/progress/queries";

const BRANCH_CODE = {
  cs: "BRANCH 01",
  math: "BRANCH 02",
  physics: "BRANCH 03",
  ai: "BRANCH 04",
} as const;

export default async function HomePage() {
  const content = getContent();
  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;

  const continueCourses = progress
    ? [...progress.statusByCourse.entries()]
        .filter(([, status]) => status === "learning")
        .map(([id]) => content.coursesById.get(id))
        .filter((course) => course !== undefined)
        .slice(0, 3)
    : [];

  return (
    <div className="page-stack">
      <section className="guild-hero">
        <div className="guild-hero-copy">
          <p className="page-kicker text-[#d8ae5c]">
            GUILD OPERATIONS // 理科学习远征
          </p>
          <h1>学者公会</h1>
          <p className="hero-copy">
            这里没有课程收藏夹。每门公开课是一座需要推进的地下城，每个分集是一场遭遇战；
            通关课程、掌握技能、完成转职，让你的知识构筑真正改变下一条远征路线。
          </p>
          <div className="hero-actions">
            <Link
              href={user ? "/paths" : "/register"}
              className="command-button"
            >
              {user ? "打开远征地图" : "建立角色档案"}
            </Link>
            <Link href="/courses" className="command-button secondary">
              查阅副本档案
            </Link>
          </div>
        </div>

        <div className="hero-rail" aria-label="公会档案统计">
          <div className="hero-stat">
            <span>公开课副本</span>
            <strong>{content.courses.length}</strong>
          </div>
          <div className="hero-stat">
            <span>远征路线</span>
            <strong>{content.paths.length}</strong>
          </div>
          <div className="hero-stat">
            <span>可掌握技能</span>
            <strong>{content.skillNodes.length}</strong>
          </div>
          <div className="hero-stat">
            <span>转职方向</span>
            <strong>{content.jobs.length}</strong>
          </div>
        </div>
      </section>

      {progress && user && (
        <section className="hud-panel p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.7fr)_1.3fr]">
            <div>
              <p className="page-kicker">ADVENTURER STATUS</p>
              <p className="mb-2 font-bold">
                {user.displayName || user.username} · 当前战备
              </p>
              <XpBar level={progress.level} />
            </div>
            <div>
              <div className="section-heading !mb-2 text-base">
                <span>继续攻略</span>
              </div>
              {continueCourses.length > 0 ? (
                <div className="grid gap-2">
                  {continueCourses.map((course) => {
                    const watched =
                      progress.watchedByCourse.get(course.id)?.size ?? 0;
                    const pct = Math.round(
                      (watched / course.episodes.length) * 100,
                    );
                    return (
                      <Link
                        key={course.id}
                        href={`/courses/${course.id}`}
                        className="quest-row !min-h-14 !grid-cols-[1fr_auto] !px-3 !py-2"
                      >
                        <span>
                          <b>{course.title}</b>
                          <span className="ml-2 quest-meta">
                            {watched}/{course.episodes.length} 遭遇
                          </span>
                        </span>
                        <span className="font-mono text-xs text-gold">
                          {pct}%
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Link href="/paths" className="text-sm text-gold">
                  尚未部署远征，前往路径地图选择第一项任务 →
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="section-heading">
          <span>四大学术分部</span>
        </div>
        <div className="branch-grid">
          {SUBJECTS.map((subject) => {
            const count = content.courses.filter(
              (course) => course.subject === subject,
            ).length;
            return (
              <Link
                key={subject}
                href={`/courses?subject=${subject}`}
                className="branch-tile"
                data-subject={subject}
              >
                <div className="branch-code">{BRANCH_CODE[subject]}</div>
                <div className="branch-symbol"><SubjectIcon subject={subject} /></div>
                <div className="branch-name">{SUBJECT_LABEL[subject]}</div>
                <div className="mt-1 text-xs text-muted">
                  {count} 座可进入副本
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <div className="section-heading">
          <span>当前远征任务</span>
          <Link href="/paths" className="font-sans text-xs text-gold">
            查看完整战役地图 →
          </Link>
        </div>
        <div className="quest-board">
          {content.paths.slice(0, 8).map((path, index) => {
            const dungeonCount = path.stages.reduce(
              (sum, stage) => sum + stage.courses.length,
              0,
            );
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
                  <span className="flex items-center gap-2">
                    <b className="truncate">{path.title}</b>
                    <span className="quest-meta">
                      <SubjectIcon subject={path.subject} />
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted">
                    {path.description}
                  </span>
                  <span className="quest-meta mt-1 block">
                    {path.stages.length} 章 · {dungeonCount} 座副本
                  </span>
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
