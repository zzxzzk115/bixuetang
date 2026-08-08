import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FlaskConical, Map as MapIcon, Sparkles } from "lucide-react";
import { AppAnalysisMap } from "@/components/app/app-analysis-map";
import { AppEpisodeList } from "@/components/app/app-episode-list";
import { AppShell } from "@/components/app/app-shell";
import { CoursePlayer } from "@/components/app/course-player";
import { Fold } from "@/components/app/fold";
import { renderLatex } from "@/lib/math/render-latex";
import { renderMathText } from "@/lib/math/render-math-text";
import { buildSegments } from "@/lib/segments";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { getActiveBoost } from "@/lib/game/boosts";
import { getUserState } from "@/lib/game/user-state";
import { getWatchProgress } from "@/lib/game/watch-actions";
import { boostedXp, episodeXp } from "@/lib/game/xp";
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
  math: "var(--app-teal)",
  physics: "var(--app-orange)",
  ai: "var(--app-green)",
  en: "var(--app-pink)",
  history: "var(--app-brown)",
};

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ seg?: string; ep?: string }>;
}) {
  const { id } = await params;
  const content = getContent();
  const course = content.coursesById.get(id);
  if (!course) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bootstrap = getGameBootstrap(user);

  // 前置没打过底的课，直接开 URL 也进不来——地图上锁着，这里就不能是后门
  const summary = bootstrap.courses.find((c) => c.id === id);
  if (summary && !summary.unlocked) {
    return (
      <AppShell bootstrap={bootstrap}>
        <div className="app-page course-locked">
          <h1>这门课还没解锁</h1>
          <p>
            先把
            {summary.missingPrereqs.map((p, i) => (
              <span key={p.id}>
                {i > 0 ? "、" : ""}
                <Link href={`/courses/${p.id}`}>《{p.title}》</Link>
              </span>
            ))}
            学完，再回来开这门。
          </p>
          <Link className="app-btn-primary" href="/play">
            <MapIcon size={16} aria-hidden /> 回到地图
          </Link>
        </div>
      </AppShell>
    );
  }

  const progress = getUserProgress(user.id);
  const watched = progress.watchedByCourse.get(id);

  // 分段作用域：?seg= 对应地图上的视频节点;?ep= 深链直达某集(分享/复习回看)
  const { seg, ep } = await searchParams;
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

  // 播放进度（续播 + 已看百分比）与本段第一集未看的集
  const watchProgress = await getWatchProgress(id);
  const playerPrefs = getUserState(user.id).playerPrefs;
  const firstUnwatched = episodes.find((e) => !watched?.has(e.n));

  // 各集带时间戳的关键点(播放器进度条刻度 + 分段边界)
  // 与分段定义(碎片化学习的 chips):两端都用 buildSegments 同一份纯函数
  const keyPointsByEpisode: Record<number, { t: number; title: string }[]> = {};
  for (const ep of analysisRaw?.episodes ?? []) {
    const marks = ep.keyPoints
      .filter((kp) => typeof kp.t === "number")
      .map((kp) => ({ t: kp.t as number, title: kp.title }));
    if (marks.length > 0) keyPointsByEpisode[ep.n] = marks;
  }
  const segmentsByEpisode: Record<
    number,
    { idx: number; title: string; from: number; to: number }[]
  > = {};
  for (const ep of episodes) {
    // YAML 缺 durationSec 时用播放器实测的时长兜底(至少打开过一次才有)
    const durationSec =
      ep.durationSec ?? watchProgress[ep.n]?.durationSec ?? 0;
    if (!durationSec) continue;
    const segs = buildSegments({
      durationSec,
      keyPoints: keyPointsByEpisode[ep.n] ?? [],
    });
    if (segs.length > 0) segmentsByEpisode[ep.n] = segs;
  }

  // 已打卡完成的集,观看/分段覆盖率一律按 100% 呈现——旧版本(还没有
  // 分段数据)看完的用户不该看到「章节 0%」,播放器角标也不该显示 0%
  for (const ep of episodes) {
    if (!watched?.has(ep.n)) continue;
    const w = watchProgress[ep.n];
    watchProgress[ep.n] = {
      positionSec: w?.positionSec ?? 0,
      durationSec: w?.durationSec ?? ep.durationSec ?? 0,
      ratioPct: 100,
      segmentsPct: (segmentsByEpisode[ep.n] ?? []).map(() => 100),
    };
  }

  // 每集可得 XP（含药水加成）——学习前就让玩家看到收益
  const boost = getActiveBoost(user.id);
  const xpByEpisode: Record<number, number> = {};
  for (const ep of episodes) {
    const base = episodeXp(course.level, ep.durationSec);
    xpByEpisode[ep.n] = boost ? boostedXp(base, boost.multiplierPct) : base;
  }

  const color = SUBJECT_COLOR[course.subject] ?? "var(--app-blue)";
  const watchedCount = episodes.filter((e) => watched?.has(e.n)).length;
  const percent =
    episodes.length === 0
      ? 0
      : Math.round((watchedCount / episodes.length) * 100);

  return (
    // 不传 routeTitle：课程名在 Hero 里，顶栏不再出现假按钮胶囊
    <AppShell bootstrap={bootstrap}>
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
          <CoursePlayer
            courseId={id}
            sources={course.sources}
            courseTitle={course.title}
            episodes={episodes}
            initialEpisode={
              (ep !== undefined &&
              episodes.some((e) => e.n === Number(ep))
                ? Number(ep)
                : undefined) ??
              firstUnwatched?.n ??
              episodes[0]?.n ??
              1
            }
            resumeByEpisode={watchProgress}
            serverPrefs={playerPrefs}
            keyPointsByEpisode={keyPointsByEpisode}
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
            scopedNode={!!segNode}
            color={color}
            xpByEpisode={xpByEpisode}
            multiplierPct={boost?.multiplierPct ?? 100}
            segmentsByEpisode={segmentsByEpisode}
            segmentCoverageByEpisode={Object.fromEntries(
              Object.entries(watchProgress).map(([n, w]) => [
                n,
                w.segmentsPct,
              ]),
            )}
          />
        </section>

        {analysis && analysis.episodes.length > 0 && (
          <Fold
            icon={<Sparkles size={18} aria-hidden />}
            title="知识点地图"
            note={`${analysis.episodes.length} 集已分析`}
            defaultOpen
          >
            <AppAnalysisMap
              analysis={analysis}
              episodes={episodes}
              formulaHtml={formulaHtml}
              richTextHtml={richTextHtml}
            />
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

        {/* 相关链接:官网/原视频/社区笔记都在这——课程与视频的 credit,
            官网资源(讲义/作业)必须给到,别让站内成为信息孤岛 */}
        {(() => {
          const related: { title: string; url: string; author?: string }[] = [
            ...course.sources
              .filter((s) => s.platform === "other")
              .map((s) => ({
                title: s.note?.includes("官网")
                  ? s.note
                  : `课程官网${s.note ? ` · ${s.note}` : ""}`,
                url: s.url,
              })),
            ...course.sources
              .filter((s) => s.platform === "bilibili")
              .map((s) => ({
                title: "bilibili 原视频",
                url: s.url,
                author: s.uploader,
              })),
            ...course.notes,
          ];
          if (related.length === 0) return null;
          return (
            <section className="course-card">
              <div className="course-card-head">
                <h2>相关链接</h2>
              </div>
              <ul className="course-links">
                {related.map((n, i) => (
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
          );
        })()}

        {/* 技能星盘未迁移 App 风格，入口暂藏（玩法上称号 vs 技能树也待定夺） */}

        {inPaths.length > 0 && (
          <section className="course-card">
            <div className="course-card-head">
              <h2>
                <MapIcon size={17} aria-hidden /> 所属路线
              </h2>
            </div>
            <ul className="course-links">
              {/* 路线详情页还没迁移、暂时下线，先只把名字列出来不给链接 */}
              {inPaths.map((p) => (
                <li key={p.id}>
                  <span>
                    <i />
                    {p.title}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
