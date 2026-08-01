import Link from "next/link";
import { StatusBadge, SUBJECT_ICON } from "@/components/badges";
import { XpBar } from "@/components/xp-bar";
import { requireUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { SUBJECT_LABEL, SUBJECTS } from "@/lib/content/schema";
import { skillPointsEarned } from "@/lib/game/level";
import { spentPoints } from "@/lib/game/skills";
import {
  getHeldJobs,
  getSubjectXp,
  getUserProgress,
  getXpLog,
} from "@/lib/progress/queries";

export const metadata = { title: "角色面板" };

export default async function MePage() {
  const user = await requireUser();
  const content = getContent();
  const progress = getUserProgress(user.id);
  const subjectXp = getSubjectXp(progress);
  const xpLog = getXpLog(user.id, 20);
  const maxSubjectXp = Math.max(1, ...Object.values(subjectXp));

  const points =
    skillPointsEarned(progress.level.level) -
    spentPoints(content.skillNodes, progress.litSkills);

  const held = getHeldJobs(user.id);
  const heldJobs = content.jobs.filter((j) => held.has(j.id));
  const activeTitle =
    content.jobById.get(user.activeJobId ?? "")?.title ??
    heldJobs.find((j) => j.tier === 0)?.title ??
    "冒险者";

  const activeCourses = [...progress.statusByCourse.entries()]
    .filter(([, s]) => s === "learning" || s === "done")
    .map(([id, status]) => ({ course: content.coursesById.get(id), status }))
    .filter((e) => e.course !== undefined);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* 角色状态窗 */}
      <aside className="space-y-5">
        <section className="rounded-lg border border-edge bg-panel p-5">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-gold bg-panel-hover text-3xl">
              🧙
            </div>
            <h1 className="mt-2 text-lg font-bold">
              {user.displayName || user.username}
            </h1>
            <p className="text-xs text-gold">{activeTitle}</p>
          </div>
          <div className="mt-4">
            <XpBar level={progress.level} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
            <div className="rounded bg-panel-hover p-2">
              <div className="font-bold text-gold">{progress.totalXp}</div>
              <div className="text-xs text-muted">总经验</div>
            </div>
            <div className="rounded bg-panel-hover p-2">
              <div className="font-bold text-mana">{points}</div>
              <div className="text-xs text-muted">技能点</div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-edge bg-panel p-5">
          <h2 className="mb-3 text-sm font-bold text-muted">⚜️ 职业徽章</h2>
          <div className="flex flex-wrap gap-1.5">
            {heldJobs.map((j) => (
              <span
                key={j.id}
                className={`rounded border px-2 py-1 text-xs ${
                  (user.activeJobId ?? heldJobs[0]?.id) === j.id
                    ? "border-gold bg-amber-950 text-gold"
                    : "border-edge bg-panel-hover text-muted"
                }`}
              >
                {j.title}
              </span>
            ))}
          </div>
          <Link
            href="/jobs"
            className="mt-3 inline-block text-xs text-gold hover:underline"
          >
            前往转职殿堂 →
          </Link>
        </section>

        <section className="rounded-lg border border-edge bg-panel p-5">
          <h2 className="mb-3 text-sm font-bold text-muted">四维修为</h2>
          <div className="space-y-2.5">
            {SUBJECTS.map((s) => (
              <div key={s}>
                <div className="flex justify-between text-xs">
                  <span>
                    {SUBJECT_ICON[s]} {SUBJECT_LABEL[s]}
                  </span>
                  <span className="text-muted">{subjectXp[s]}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-edge">
                  <div
                    className="h-full rounded-full bg-mana"
                    style={{
                      width: `${(subjectXp[s] / maxSubjectXp) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-lg font-bold">⚔️ 我的副本</h2>
          {activeCourses.length === 0 ? (
            <p className="rounded-lg border border-edge bg-panel p-6 text-center text-sm text-muted">
              还没有进行中的副本，去{" "}
              <Link href="/courses" className="text-gold underline">
                副本图鉴
              </Link>{" "}
              挑一个开刷吧
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {activeCourses.map(({ course, status }) => {
                const c = course!;
                const watched = progress.watchedByCourse.get(c.id)?.size ?? 0;
                const pct = Math.round((watched / c.episodes.length) * 100);
                return (
                  <Link
                    key={c.id}
                    href={`/courses/${c.id}`}
                    className="rounded-lg border border-edge bg-panel p-4 transition-colors hover:border-gold"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{c.title}</span>
                      <StatusBadge status={status} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted">
                      <span>
                        {watched} / {c.episodes.length} 集
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-edge">
                      <div
                        className={`h-full ${pct >= 100 ? "bg-gold" : "bg-hp"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">📜 冒险日志</h2>
          {xpLog.length === 0 ? (
            <p className="rounded-lg border border-edge bg-panel p-6 text-center text-sm text-muted">
              日志空空如也——击败第一只小怪后这里会记下你的战绩
            </p>
          ) : (
            <ul className="space-y-1.5">
              {xpLog.map((e, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded border border-edge bg-panel px-3 py-2 text-sm"
                >
                  <span
                    className={e.reason === "course-done" ? "text-gold" : ""}
                  >
                    {e.label}
                  </span>
                  <span className="shrink-0 font-bold text-xp">
                    +{e.amount} XP
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
