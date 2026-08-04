import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FlaskConical, Map as MapIcon, Sparkles } from "lucide-react";
import { AnalysisPanel } from "@/components/analysis-panel";
import { AppEpisodeList } from "@/components/app/app-episode-list";
import { AppShell } from "@/components/app/app-shell";
import { Fold } from "@/components/app/fold";
import { EmbedPlayer } from "@/components/embed-player";
import { renderLatex } from "@/lib/math/render-latex";
import { renderMathText } from "@/lib/math/render-math-text";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { buildLessonTrack, findTrackNode } from "@/lib/game/lesson-track";
import { courseHasQuiz } from "@/lib/game/quiz-bank";
import { LEVEL_LABEL, SUBJECT_LABEL } from "@/lib/content/schema";
import { LABS } from "@/lib/labs";
import { getUserProgress } from "@/lib/progress/queries";

// 课程页（多邻国式原生布局）：学科色 Hero + 播放器卡 + 大圆勾分集清单 +
// 折叠的知识点/关联信息。AI 分析等重组件复用旧实现，套 .app-skin 适配层。
//
// 分段作用域：地图视频节点带 ?seg=<index> 进来时，本页只呈现该节点覆盖
// 的集数（清单/进度/知识点/学习面板全部收窄），与地图节点一一对应；
// 分集线性解锁（看完上一集才开下一集）在 AppEpisodeList 内实施。

const SUBJECT_COLOR: Record<string, string> = {
  cs: "var(--app-blue)",
  math: "var(--app-purple)",
  physics: "var(--app-orange)",
  ai: "var(--app-green)",
};

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ seg?: string }>;
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

  // 分段作用域：?seg= 对应地图上的视频节点
  const { seg } = await searchParams;
  const track = buildLessonTrack(
    course.episodes.map((e) => e.n),
    courseHasQuiz(id),
  );
  const segIndex = seg !== undefined ? Number(seg) : null;
  const segNode =
    segIndex !== null && Number.isInteger(segIndex)
      ? findTrackNode(track, "video", segIndex)
      : undefined;
  const scopeEps = segNode ? new Set(segNode.eps) : null;
  /** 本页呈现的集（分段时只留该节点覆盖的） */
  const episodes = scopeEps
    ? course.episodes.filter((e) => scopeEps.has(e.n))
    : course.episodes;
  const segLabel = segNode
    ? segNode.eps.length === 1
      ? `第 ${segNode.eps[0]} 集`
      : `第 ${segNode.eps[0]}–${segNode.eps[segNode.eps.length - 1]} 集`
    : null;

  const prereqs = course.prerequisites
    .map((p) => content.coursesById.get(p))
    .filter((c) => c !== undefined);
  const inPaths = content.paths.filter((p) =>
    p.stages.some((s) => s.courses.includes(id)),
  );
  const analysisRaw = content.analysisByCourse.get(id);
  // 分段时知识点/时间线同步收窄到该节点覆盖的集
  const analysis =
    analysisRaw && scopeEps
      ? {
          ...analysisRaw,
          episodes: analysisRaw.episodes.filter((e) => scopeEps.has(e.n)),
        }
      : analysisRaw;
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

  const color = SUBJECT_COLOR[course.subject] ?? "var(--app-blue)";
  const watchedCount = episodes.filter((e) => watched?.has(e.n)).length;
  const percent =
    episodes.length === 0
      ? 0
      : Math.round((watchedCount / episodes.length) * 100);

  return (
    <AppShell bootstrap={bootstrap} routeTitle={course.title}>
      <div className="app-page app-course">
        {/* 学科色 Hero（同地图单元横幅一脉）；分段时标明当前小节 */}
        <header className="course-hero" style={{ background: color }}>
          <div className="course-hero-tags">
            <span>{SUBJECT_LABEL[course.subject]}</span>
            <span>{LEVEL_LABEL[course.level]}</span>
            {segLabel ? (
              <span className="course-hero-seg">{segLabel}</span>
            ) : (
              course.estimatedHours && <span>约 {course.estimatedHours} 小时</span>
            )}
          </div>
          <h1>{course.title}</h1>
          <p>
            {course.code}
            {course.institution ? ` · ${course.institution}` : ""}
            {course.instructor ? ` · ${course.instructor}` : ""}
          </p>
          <div className="course-hero-bar">
            <i style={{ width: `${percent}%` }} />
          </div>
          <small>
            {segLabel ? `本小节 ${watchedCount}/${episodes.length} 集` : `${watchedCount}/${episodes.length} 集`}
            {" · "}
            {percent}%
          </small>
          {segLabel && (
            <Link className="course-hero-all" href={`/courses/${id}`}>
              查看整门课程 ›
            </Link>
          )}
        </header>

        <div id="course-player" className="course-card app-skin course-player">
          <EmbedPlayer
            sources={course.sources}
            courseTitle={course.title}
            episodes={course.episodes}
          />
        </div>

        {course.description && (
          <p className="course-desc app-skin">
            <span
              className="analysis-rich-text"
              dangerouslySetInnerHTML={{
                __html: richTextHtml[course.description],
              }}
            />
          </p>
        )}

        <section className="course-card">
          <div className="course-card-head">
            <h2>{segLabel ? `本小节分集 · ${segLabel}` : "分集清单"}</h2>
          </div>
          <AppEpisodeList
            courseId={id}
            episodes={episodes}
            watched={watched ? [...watched] : []}
            color={color}
          />
        </section>

        {analysis && analysis.episodes.length > 0 && (
          <Fold
            icon={<Sparkles size={18} aria-hidden />}
            title="知识点地图"
            note={`${analysis.episodes.length} 集已分析`}
            defaultOpen
          >
            <div className="app-skin">
              <AnalysisPanel
                analysis={analysis}
                episodes={episodes}
                formulaHtml={formulaHtml}
                richTextHtml={richTextHtml}
              />
            </div>
          </Fold>
        )}

        {course.lab && (
          <Link href={LABS[course.lab].href} className="course-row">
            <span className="course-row-icon" style={{ color: "var(--app-gold)" }}>
              <FlaskConical size={20} />
            </span>
            <span className="course-row-body">
              <b>{LABS[course.lab].title}</b>
              <small>{LABS[course.lab].description}</small>
            </span>
            <span aria-hidden>›</span>
          </Link>
        )}

        {prereqs.length > 0 && (
          <section className="course-card">
            <div className="course-card-head">
              <h2>前置课程</h2>
            </div>
            <ul className="course-links">
              {prereqs.map((p) => {
                const done = progress.statusByCourse.get(p.id) === "done";
                return (
                  <li key={p.id}>
                    <Link href={`/courses/${p.id}`}>
                      <i className={done ? "done" : undefined} />
                      {p.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {course.notes.length > 0 && (
          <section className="course-card">
            <div className="course-card-head">
              <h2>社区攻略笔记</h2>
            </div>
            <ul className="course-links">
              {course.notes.map((n, i) => (
                <li key={i}>
                  <a href={n.url} target="_blank" rel="noreferrer noopener">
                    <i />
                    {n.title}
                    {n.author ? <small> by {n.author}</small> : null} ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 技能星盘未迁移 App 风格，入口暂藏（玩法上称号 vs 技能树也待定夺） */}

        {inPaths.length > 0 && (
          <section className="course-card">
            <div className="course-card-head">
              <h2>
                <MapIcon size={17} aria-hidden /> 所属路线
              </h2>
            </div>
            <ul className="course-links">
              {inPaths.map((p) => (
                <li key={p.id}>
                  <Link href={`/paths/${p.id}`}>
                    <i />
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
