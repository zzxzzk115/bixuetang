import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Route } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { CareerGlyph, ROADMAP_TONE } from "@/components/app/career-glyph";
import { RouteSuggest } from "@/components/app/route-suggest";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { roadmapIcon } from "@/lib/game/roadmap-choices";

export const metadata = { title: "学习路线" };
export const dynamic = "force-dynamic";

export default async function RoadmapsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bootstrap = getGameBootstrap(user);
  const { roadmaps } = getContent();

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page">
        <header className="app-page-head">
          <h1>
            <Route size={22} className="inline" aria-hidden /> 学习路线：成为 X
          </h1>
          <p className="me-note">
            跨学科的职业路线,把散落的课程串成一条「从零到能上手」的清晰路。
            选一条,按里程碑一步步走。
          </p>
        </header>

        <div className="roadmap-grid">
          {roadmaps.map((r) => {
            const courseCount = r.stages.reduce(
              (n, s) => n + s.courses.length,
              0,
            );
            return (
              <Link
                key={r.id}
                href={`/roadmaps/${r.id}`}
                className="roadmap-card"
              >
                <span
                  className="roadmap-card-icon"
                  style={{
                    ["--tone" as string]:
                      ROADMAP_TONE[r.id] ?? "var(--app-green)",
                  }}
                  aria-hidden
                >
                  <CareerGlyph icon={roadmapIcon(r.id)} size={22} />
                </span>
                <b>{r.title}</b>
                {r.tagline ? <small>{r.tagline}</small> : null}
                <span className="roadmap-card-meta">
                  {r.stages.length} 个阶段 · {courseCount} 门课
                  <ChevronRight size={16} aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>

        <RouteSuggest />
      </div>
    </AppShell>
  );
}
