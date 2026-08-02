import { PromoteButton, TitleButton } from "@/components/job-actions";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { canPromote, type PromoteVerdict } from "@/lib/game/jobs";
import { getHeldJobs, getUserProgress } from "@/lib/progress/queries";
import type { Job } from "@/lib/content/schema";

export const metadata = { title: "转职殿堂" };

const TIER_TITLE = [
  "0 转 · 起点",
  "1 转 · 学徒",
  "2 转 · 大师与兼修",
  "3 转 · 传说",
];

function RequirementList({
  job,
  verdict,
  level,
  litSkills,
  held,
  skillTitle,
  jobTitle,
}: {
  job: Job;
  verdict: PromoteVerdict | null;
  level: number;
  litSkills: Set<string>;
  held: Set<string>;
  skillTitle: (id: string) => string;
  jobTitle: (id: string) => string;
}) {
  const req = job.requires;
  const items: { ok: boolean; text: string }[] = [];

  for (const p of job.parents) {
    items.push({ ok: held.has(p), text: `持有「${jobTitle(p)}」` });
  }
  if (req.minLevel) {
    items.push({
      ok: level >= req.minLevel,
      text: `等级 ≥ ${req.minLevel}（当前 Lv.${level}）`,
    });
  }
  for (const s of req.skills?.allOf ?? []) {
    items.push({ ok: litSkills.has(s), text: `点亮「${skillTitle(s)}」` });
  }
  if (req.skills && req.skills.anyOf.length > 0) {
    const hit = req.skills.anyOf.filter((s) => litSkills.has(s)).length;
    items.push({
      ok: hit >= req.skills.minAnyOf,
      text: `「${req.skills.anyOf.map(skillTitle).join(" / ")}」中点亮 ${req.skills.minAnyOf} 个（已 ${hit}）`,
    });
  }

  if (items.length === 0) {
    return <p className="text-xs text-muted">无条件，注册即持有</p>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {items.map((it, i) => (
        <li key={i} className={it.ok ? "text-foreground" : "text-muted"}>
          {verdict === null ? "·" : it.ok ? "✅" : "⬜"} {it.text}
        </li>
      ))}
    </ul>
  );
}

export default async function JobsPage() {
  const content = getContent();
  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;
  const held = user ? getHeldJobs(user.id) : new Set<string>();

  const skillTitle = (id: string) => content.skillById.get(id)?.title ?? id;
  const jobTitle = (id: string) => content.jobById.get(id)?.title ?? id;

  const tiers = [0, 1, 2, 3].map((t) =>
    content.jobs.filter((j) => j.tier === t),
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">转职殿堂</h1>
      <p className="mt-1 text-sm text-muted">
        条件达成后手动转职。可同时持有多个职业——多前置的复合职业代表兼修之路。
      </p>

      <div className="mt-6 space-y-8">
        {tiers.map((jobs, tier) => (
          <section key={tier}>
            <h2 className="mb-3 border-b border-edge pb-2 font-bold text-muted">
              {TIER_TITLE[tier]}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {jobs.map((job) => {
                const isHeld = held.has(job.id);
                const verdict =
                  user && progress && !isHeld
                    ? canPromote(job, {
                        level: progress.level.level,
                        litSkills: progress.litSkills,
                        heldJobs: held,
                      })
                    : null;
                const isCompound = job.parents.length > 1;
                return (
                  <div
                    key={job.id}
                    className={`flex flex-col rounded-lg border p-4 ${
                      isHeld
                        ? "border-gold bg-amber-100/60 dark:bg-amber-950/40"
                        : verdict?.ok
                          ? "border-gold bg-panel"
                          : "border-edge bg-panel opacity-90"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={`font-bold ${isHeld ? "text-gold" : ""}`}>
                        {isHeld ? "⚜️ " : ""}
                        {job.title}
                      </h3>
                      {isCompound && (
                        <span className="shrink-0 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                          兼修
                        </span>
                      )}
                    </div>
                    {job.description && (
                      <p className="mt-1 text-xs text-muted">
                        {job.description}
                      </p>
                    )}
                    <div className="mt-3 flex-1">
                      <RequirementList
                        job={job}
                        verdict={verdict}
                        level={progress?.level.level ?? 0}
                        litSkills={progress?.litSkills ?? new Set()}
                        held={held}
                        skillTitle={skillTitle}
                        jobTitle={jobTitle}
                      />
                    </div>
                    {user && (
                      <div className="mt-3">
                        {isHeld ? (
                          <TitleButton
                            jobId={job.id}
                            isActive={
                              (user.activeJobId ?? "novice") === job.id
                            }
                          />
                        ) : verdict?.ok ? (
                          <PromoteButton jobId={job.id} title={job.title} />
                        ) : (
                          <span className="block w-full rounded border border-edge py-2 text-center text-xs text-muted">
                            条件未达成
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
