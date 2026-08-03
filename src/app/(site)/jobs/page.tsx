import { PromoteButton, TitleButton } from "@/components/job-actions";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { canPromote, type PromoteVerdict } from "@/lib/game/jobs";
import { getHeldJobs, getUserProgress } from "@/lib/progress/queries";
import type { Job } from "@/lib/content/schema";

export const metadata = { title: "转职殿堂" };

const TIER_TITLE = [
  "起始档案",
  "一转 · 学徒职业",
  "二转 · 大师与兼修",
  "三转 · 传奇职业",
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

  for (const parent of job.parents) {
    items.push({
      ok: held.has(parent),
      text: `持有「${jobTitle(parent)}」`,
    });
  }
  if (req.minLevel) {
    items.push({
      ok: level >= req.minLevel,
      text: `等级 ≥ ${req.minLevel}（当前 Lv.${level}）`,
    });
  }
  for (const skill of req.skills?.allOf ?? []) {
    items.push({
      ok: litSkills.has(skill),
      text: `掌握「${skillTitle(skill)}」`,
    });
  }
  if (req.skills && req.skills.anyOf.length > 0) {
    const hit = req.skills.anyOf.filter((skill) =>
      litSkills.has(skill),
    ).length;
    items.push({
      ok: hit >= req.skills.minAnyOf,
      text: `候选技能中掌握 ${req.skills.minAnyOf} 个（当前 ${hit}）`,
    });
  }

  if (items.length === 0) {
    return <p className="text-xs text-muted">无条件 · 建立角色后自动持有</p>;
  }

  return (
    <ul className="space-y-1.5 text-xs">
      {items.map((item, index) => (
        <li
          key={index}
          className={item.ok ? "text-foreground" : "text-muted"}
        >
          <span className={item.ok ? "text-xp" : "text-muted"}>
            {verdict === null ? "·" : item.ok ? "✓" : "□"}
          </span>{" "}
          {item.text}
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

  const skillTitle = (id: string) =>
    content.skillById.get(id)?.title ?? id;
  const jobTitle = (id: string) => content.jobById.get(id)?.title ?? id;

  const tiers = [0, 1, 2, 3].map((tier) =>
    content.jobs.filter((job) => job.tier === tier),
  );

  return (
    <div className="page-stack">
      <header className="page-intro">
        <div>
          <p className="page-kicker">CLASS ASCENSION</p>
          <h1 className="page-title">转职殿堂</h1>
          <p className="page-lead">
            职业不是装饰称号，而是你已经完成的知识构筑。达到等级、点亮技能并持有前置职业，
            才能进行一转、二转与三转；兼修职业要求同时走通多个分支。
          </p>
        </div>
        <div className="font-mono text-xs text-muted">
          CLASSES <b className="text-gold">{content.jobs.length}</b>
        </div>
      </header>

      <div className="tier-stack">
        {tiers.map((jobs, tier) => (
          <section key={tier}>
            <div className="tier-heading">
              <div className="tier-rank">{tier}</div>
              <div className="tier-label">
                <span className="page-kicker">ASCENSION TIER</span>
                {TIER_TITLE[tier]}
              </div>
            </div>
            <div className="job-grid">
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
                  <article
                    key={job.id}
                    className="job-card"
                    data-held={isHeld ? "true" : "false"}
                    data-ready={verdict?.ok ? "true" : "false"}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="job-status">
                        {isHeld
                          ? "CLASS ACQUIRED"
                          : verdict?.ok
                            ? "ASCENSION READY"
                            : "REQUIREMENTS LOCKED"}
                      </span>
                      {isCompound && (
                        <span className="border border-mana/60 px-1.5 py-0.5 font-mono text-[11px] text-mana">
                          HYBRID
                        </span>
                      )}
                    </div>
                    <h3 className={isHeld ? "text-gold" : ""}>
                      {job.title}
                    </h3>
                    {job.description && (
                      <p className="mt-1 text-xs leading-relaxed text-muted">
                        {job.description}
                      </p>
                    )}
                    <div className="mt-4 flex-1 border-t border-edge pt-3">
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
                      <div className="mt-4">
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
                          <span className="block w-full border border-edge py-2 text-center font-mono text-[12px] text-muted">
                            条件未达成
                          </span>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
