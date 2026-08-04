import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AnalysisPanel } from "@/components/analysis-panel";
import { AppShell } from "@/components/app/app-shell";
import { LevelBadge, SubjectBadge } from "@/components/badges";
import { EmbedPlayer } from "@/components/embed-player";
import { LearningSessionPanel } from "@/components/learning-session-panel";
import { renderLatex } from "@/lib/math/render-latex";
import { renderMathText } from "@/lib/math/render-math-text";
import { EpisodeList } from "@/components/episode-list";
import { StatusButtons } from "@/components/status-buttons";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import type { LabId } from "@/lib/content/schema";
import { LABS } from "@/lib/labs";
import { getUserProgress } from "@/lib/progress/queries";

// 课程页（App 壳版）：从地图点进来风格无缝。老组件（播放器/遭遇战清单/
// 分析面板）原样复用，观感靠 .app-skin 变量重映射统一成 App 令牌。

function LabCard({ labId }: { labId: LabId }) {
  const lab = LABS[labId];
  return (
    <Link
      href={lab.href}
      className="hud-panel block border-gold p-4 transition-colors hover:bg-panel-hover"
    >
      <p className="page-kicker">FIELD PROTOCOL</p>
      <h3 className="text-sm font-bold text-gold">{lab.title}</h3>
      <p className="mt-1 text-xs text-muted">{lab.description}</p>
      <p className="mt-1.5 text-xs text-gold">进入实验室 →</p>
    </Link>
  );
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const content = getContent();
  const course = content.coursesById.get(id);
  if (!course) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bootstrap = getGameBootstrap(user);

  const progress = getUserProgress(user.id);
  const watched = progress.watchedByCourse.get(id);
  const status = progress.statusByCourse.get(id) ?? null;
  const nextEpisode =
    course.episodes.find((episode) => !watched?.has(episode.n)) ??
    course.episodes[0];

  const prereqs = course.prerequisites
    .map((p) => content.coursesById.get(p))
    .filter((c) => c !== undefined);
  const inPaths = content.paths.filter((p) =>
    p.stages.some((s) => s.courses.includes(id)),
  );
  const relatedSkills = content.skillNodes.filter((n) =>
    n.courses.includes(id),
  );
  const analysis = content.analysisByCourse.get(id);
  // 公式在服务端排版好再传下去——KaTeX 因此不会进客户端包，
  // 课程页只需要多加载 KaTeX 的 CSS 与字体
  const formulaHtml: Record<string, string> = {};
  const richTextHtml: Record<string, string> = {};
  const addRichText = (text: string | undefined) => {
    if (text && !richTextHtml[text]) richTextHtml[text] = renderMathText(text);
  };
  addRichText(course.description);
  addRichText(analysis?.overview);
  for (const ep of analysis?.episodes ?? []) {
    addRichText(ep.summary);
    addRichText(
      ep.summary.length > 48 ? ep.summary.slice(0, 48) + "…" : ep.summary,
    );
    for (const kp of ep.keyPoints) {
      addRichText(kp.title);
      addRichText(kp.detail);
      if (!kp.formula || formulaHtml[kp.formula]) continue;
      const html = renderLatex(kp.formula);
      if (html) formulaHtml[kp.formula] = html;
    }
  }

  return (
    <AppShell bootstrap={bootstrap} routeTitle={course.title}>
      <div className="app-skin app-page">
        <div className="grid gap-5">
          <div className="hud-panel p-5">
            <p className="page-kicker">COURSE // {course.code ?? course.id}</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">{course.title}</h1>
              <LevelBadge level={course.level} />
              <SubjectBadge subject={course.subject} />
            </div>
            <p className="mt-1 text-sm text-muted">
              {course.code}
              {course.institution ? ` · ${course.institution}` : ""}
              {course.instructor ? ` · ${course.instructor}` : ""}
              {course.estimatedHours ? ` · 约 ${course.estimatedHours} 小时` : ""}
            </p>
          </div>

          <div id="course-player" className="player-frame">
            <EmbedPlayer
              sources={course.sources}
              courseTitle={course.title}
              episodes={course.episodes}
            />
          </div>

          {course.description && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
              <span
                className="analysis-rich-text"
                dangerouslySetInnerHTML={{
                  __html: richTextHtml[course.description],
                }}
              />
            </p>
          )}

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="combat-heading">遭遇战清单</h2>
              <StatusButtons courseId={id} current={status} loggedIn={!!user} />
            </div>
            <EpisodeList
              courseId={id}
              episodes={course.episodes}
              watched={watched ? [...watched] : []}
              loggedIn={!!user}
            />
          </div>

          {analysis && (
            <AnalysisPanel
              analysis={analysis}
              episodes={course.episodes}
              formulaHtml={formulaHtml}
              richTextHtml={richTextHtml}
            />
          )}

          <LearningSessionPanel
            courseId={course.id}
            episodes={course.episodes}
            initialEpisode={nextEpisode.n}
            loggedIn={!!user}
          />
          {course.lab && <LabCard labId={course.lab} />}

          {prereqs.length > 0 && (
            <section className="hud-panel p-4">
              <h3 className="mb-2 text-sm font-bold text-muted">前置副本</h3>
              <ul className="space-y-1.5">
                {prereqs.map((p) => {
                  const done = progress.statusByCourse.get(p.id) === "done";
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/courses/${p.id}`}
                        className="text-sm text-foreground hover:text-gold"
                      >
                        {done ? "✅" : "⬜"} {p.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {course.notes.length > 0 && (
            <section className="hud-panel p-4">
              <h3 className="mb-2 text-sm font-bold text-muted">
                社区攻略笔记
              </h3>
              <ul className="space-y-1.5">
                {course.notes.map((n, i) => (
                  <li key={i}>
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-sm text-foreground hover:text-gold"
                    >
                      {n.kind === "github" ? "🐙" : "🔗"} {n.title} ↗
                    </a>
                    {n.author && (
                      <span className="ml-1 text-xs text-muted">
                        by {n.author}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {relatedSkills.length > 0 && (
            <section className="hud-panel p-4">
              <h3 className="mb-2 text-sm font-bold text-muted">可解锁技能</h3>
              <ul className="space-y-1.5 text-sm">
                {relatedSkills.map((n) => (
                  <li key={n.id}>
                    <span className="text-gold">◆</span> {n.title}
                    <span className="ml-1 text-xs text-muted">
                      T{n.tier} · 需 {n.cost} 技能点
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href="/skill-tree"
                className="mt-2 inline-block text-xs text-gold hover:underline"
              >
                前往技能树加点 →
              </Link>
            </section>
          )}

          {inPaths.length > 0 && (
            <section className="hud-panel p-4">
              <h3 className="mb-2 text-sm font-bold text-muted">所属远征路径</h3>
              <ul className="space-y-1.5">
                {inPaths.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/paths/${p.id}`}
                      className="text-sm text-foreground hover:text-gold"
                    >
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
