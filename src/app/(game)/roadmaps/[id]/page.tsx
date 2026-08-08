import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Check, Lock } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { CareerGlyph, ROADMAP_TONE } from "@/components/app/career-glyph";
import { GoalButton } from "@/components/app/goal-button";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { SUBJECT_LABEL } from "@/lib/content/schema";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { roadmapIcon } from "@/lib/game/roadmap-choices";

export const metadata = { title: "学习路线" };
export const dynamic = "force-dynamic";

export default async function RoadmapDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const roadmap = getContent().roadmapsById.get(id);
  if (!roadmap) notFound();

  const bootstrap = getGameBootstrap(user);
  const byId = new Map(bootstrap.courses.map((c) => [c.id, c]));
  const currentGoalId = bootstrap.goalRoadmap;
  const currentGoalTitle = currentGoalId
    ? (getContent().roadmapsById.get(currentGoalId)?.title ?? null)
    : null;

  let doneN = 0;
  let totalN = 0;
  for (const s of roadmap.stages)
    for (const cid of s.courses) {
      totalN++;
      const c = byId.get(cid);
      if (c && c.status === "done") doneN++;
    }

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page">
        <Link href="/roadmaps" className="admin-back">
          <ArrowLeft size={15} aria-hidden /> 全部学习路线
        </Link>
        <header className="app-page-head">
          <h1 className="roadmap-detail-title">
            <span
              className="roadmap-card-icon"
              style={{
                ["--tone" as string]:
                  ROADMAP_TONE[roadmap.id] ?? "var(--app-green)",
              }}
              aria-hidden
            >
              <CareerGlyph icon={roadmapIcon(roadmap.id)} size={22} />
            </span>
            {roadmap.title}
          </h1>
          {roadmap.description ? (
            <p className="me-note">{roadmap.description}</p>
          ) : null}
          <p className="me-note roadmap-progress">
            已完成 {doneN}/{totalN} 门课
          </p>
          <GoalButton
            roadmapId={roadmap.id}
            roadmapTitle={roadmap.title}
            currentGoalId={currentGoalId}
            currentGoalTitle={currentGoalTitle}
          />
        </header>

        <div className="roadmap-stages">
          {roadmap.stages.map((stage, si) => (
            <section key={si} className="roadmap-stage">
              <div className="roadmap-stage-head">
                <span className="roadmap-stage-no">{si + 1}</span>
                <div>
                  <b>{stage.title}</b>
                  {stage.note ? <small>{stage.note}</small> : null}
                </div>
              </div>
              <ul className="roadmap-course-list">
                {stage.courses.map((cid) => {
                  const c = byId.get(cid);
                  if (!c) return null;
                  const done = c.status === "done";
                  const locked = !c.unlocked;
                  const watched = c.watchedCount;
                  return (
                    <li key={cid} className="roadmap-course">
                      <Link
                        href={`/courses/${cid}`}
                        className={`roadmap-course-link${locked ? " is-locked" : ""}`}
                      >
                        <span className="roadmap-course-state" aria-hidden>
                          {done ? (
                            <Check size={16} />
                          ) : locked ? (
                            <Lock size={14} />
                          ) : (
                            <i className="roadmap-dot" />
                          )}
                        </span>
                        <span className="roadmap-course-body">
                          <b>{c.title}</b>
                          <small>
                            {SUBJECT_LABEL[c.subject]}
                            {done
                              ? " · 已完成"
                              : locked
                                ? " · 需先学前置"
                                : watched > 0
                                  ? ` · ${watched}/${c.episodeCount} 集`
                                  : ` · ${c.episodeCount} 集`}
                          </small>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
