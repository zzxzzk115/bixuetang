import Link from "next/link";
import {
  BookOpenText,
  Check,
  Crown,
  FlaskConical,
  LockKeyhole,
  MapPinned,
  Orbit,
  ShieldAlert,
  Swords,
} from "lucide-react";
import { notFound } from "next/navigation";
import { TowerViewport } from "@/components/tower-viewport";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { SUBJECT_LABEL, type Course } from "@/lib/content/schema";
import { getUserProgress, type UserProgress } from "@/lib/progress/queries";

const W = 760;
const TOP = 128;
const FLOOR_H = 188;
const BOTTOM = 138;
const NODE_R = 35;
const LANES = [245, 380, 515] as const;

interface TowerCourseNode {
  course: Course;
  index: number;
  stageIndex: number;
  stageTitle: string;
  x: number;
  y: number;
  isBoss: boolean;
}

interface SupportNode {
  id: string;
  type: "camp" | "archive" | "skill";
  href: string;
  title: string;
  x: number;
  y: number;
  lowerIndex: number;
  upperIndex: number;
}

function buildTower(
  stages: { title: string; courses: string[] }[],
  coursesById: Map<string, Course>,
) {
  const flat = stages.flatMap((stage, stageIndex) =>
    stage.courses.map((courseId) => ({
      course: coursesById.get(courseId)!,
      stageIndex,
      stageTitle: stage.title,
    })),
  );
  const nodes: TowerCourseNode[] = flat.map((item, index) => ({
    ...item,
    index,
    x: LANES[(index * 2 + item.stageIndex) % LANES.length],
    y: TOP + (flat.length - 1 - index) * FLOOR_H,
    isBoss: index === flat.length - 1,
  }));
  const supportKinds = [
    { type: "camp" as const, href: "/lab", title: "营地 · 实验整备" },
    { type: "archive" as const, href: "/glossary", title: "卷宗 · 知识补给" },
    { type: "skill" as const, href: "/skill-tree", title: "星盘 · 技能校准" },
  ];
  const supports: SupportNode[] = nodes.slice(0, -1).map((lower, index) => {
    const upper = nodes[index + 1];
    const kind = supportKinds[index % supportKinds.length];
    return {
      ...kind,
      id: `support-${index}`,
      x: index % 2 === 0 ? 92 : W - 92,
      y: (lower.y + upper.y) / 2,
      lowerIndex: index,
      upperIndex: index + 1,
    };
  });
  return {
    nodes,
    supports,
    height: TOP + Math.max(0, flat.length - 1) * FLOOR_H + BOTTOM,
  };
}

function courseState(
  node: TowerCourseNode,
  progress: UserProgress | null,
  currentId: string | null,
) {
  const status = progress?.statusByCourse.get(node.course.id) ?? null;
  const watched = progress?.watchedByCourse.get(node.course.id)?.size ?? 0;
  return {
    status,
    watched,
    done: status === "done",
    current: node.course.id === currentId,
    pct: Math.round((watched / node.course.episodes.length) * 100),
  };
}

export default async function PathPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const content = getContent();
  const path = content.pathsById.get(id);
  if (!path) notFound();

  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;
  const tower = buildTower(path.stages, content.coursesById);
  const currentId =
    progress === null
      ? null
      : tower.nodes.find(
          (node) => progress.statusByCourse.get(node.course.id) !== "done",
        )?.course.id ?? null;
  const doneCount = progress
    ? tower.nodes.filter(
        (node) => progress.statusByCourse.get(node.course.id) === "done",
      ).length
    : 0;
  const currentFloor =
    currentId === null
      ? 1
      : (tower.nodes.find((node) => node.course.id === currentId)?.index ?? 0) + 1;

  return (
    <div className="tower-page">
      <header className="tower-run-header">
        <div>
          <p className="page-kicker">TOWER EXPEDITION // {SUBJECT_LABEL[path.subject]}</p>
          <h1>{path.title}</h1>
          <p>{path.description}</p>
        </div>
        <div className="tower-run-status">
          <span><small>CURRENT FLOOR</small><b>{String(currentFloor).padStart(2, "0")}</b></span>
          <span><small>CLEARED</small><b>{doneCount}/{tower.nodes.length}</b></span>
        </div>
      </header>

      <div className="tower-run-layout">
        <aside className="tower-dossier">
          <div className="tower-dossier-title">
            <MapPinned aria-hidden size={18} />
            <span><small>RUN DOSSIER</small><b>本次爬塔</b></span>
          </div>
          <p>从塔底进入，清理课程遭遇并积累章节进度。课程顺序由内容路线固定为由浅入深；整备侧路只提供实验、卷宗和技能支持，不会跳过任何课程。</p>
          <dl>
            <div><dt><Swords aria-hidden size={15} /> 普通遭遇</dt><dd>基础 / 进阶课程</dd></div>
            <div><dt><ShieldAlert aria-hidden size={15} /> 精英遭遇</dt><dd>高阶课程</dd></div>
            <div><dt><Crown aria-hidden size={15} /> 塔顶 Boss</dt><dd>路线最终课程</dd></div>
            <div><dt><FlaskConical aria-hidden size={15} /> 整备侧路</dt><dd>工坊 / 卷宗 / 星盘</dd></div>
          </dl>
          {!user && <Link href="/register" className="tower-register">登记角色并保存本次远征</Link>}
        </aside>

        <TowerViewport currentId={currentId}>
          <div className="tower-map" style={{ width: W, height: tower.height }}>
            <div className="tower-spire" aria-hidden />
            <div className="tower-crown" aria-hidden><Crown size={22} /></div>
            <svg className="tower-routes" width={W} height={tower.height} aria-hidden>
              {tower.nodes.map((node, index) => {
                if (index === tower.nodes.length - 1) return null;
                const upper = tower.nodes[index + 1];
                const support = tower.supports[index];
                const lowerDone =
                  progress?.statusByCourse.get(node.course.id) === "done";
                const color = lowerDone ? "var(--gold)" : "#475248";
                return (
                  <g key={node.course.id}>
                    <path
                      d={`M ${node.x} ${node.y - NODE_R} C ${node.x} ${node.y - 78}, ${upper.x} ${upper.y + 78}, ${upper.x} ${upper.y + NODE_R}`}
                      fill="none"
                      stroke={color}
                      strokeWidth="3"
                      strokeDasharray={lowerDone ? undefined : "7 8"}
                    />
                    <path
                      d={`M ${node.x} ${node.y} Q ${support.x} ${support.y + 52}, ${support.x} ${support.y}`}
                      fill="none"
                      stroke="#705d39"
                      strokeWidth="2"
                      strokeDasharray="5 7"
                    />
                    <path
                      d={`M ${support.x} ${support.y} Q ${support.x} ${support.y - 52}, ${upper.x} ${upper.y}`}
                      fill="none"
                      stroke="#705d39"
                      strokeWidth="2"
                      strokeDasharray="5 7"
                    />
                  </g>
                );
              })}
            </svg>

            {path.stages.map((stage, stageIndex) => {
              const stageNodes = tower.nodes.filter((node) => node.stageIndex === stageIndex);
              const y = Math.min(...stageNodes.map((node) => node.y)) - 72;
              return (
                <div key={stage.title} className="tower-act-marker" style={{ top: y }}>
                  <span>ACT {String(stageIndex + 1).padStart(2, "0")}</span>
                  <b>{stage.title}</b>
                </div>
              );
            })}

            {tower.supports.map((support) => {
              const Icon =
                support.type === "camp"
                  ? FlaskConical
                  : support.type === "archive"
                    ? BookOpenText
                    : Orbit;
              return (
                <Link
                  key={support.id}
                  href={support.href}
                  className="tower-support-node"
                  data-type={support.type}
                  style={{ left: support.x - 24, top: support.y - 24 }}
                  title={support.title}
                >
                  <Icon aria-hidden size={18} />
                  <span>{support.title}</span>
                </Link>
              );
            })}

            {tower.nodes.map((node) => {
              const state = courseState(node, progress, currentId);
              const future =
                progress !== null && !state.done && !state.current;
              const Icon = state.done
                ? Check
                : node.isBoss
                  ? Crown
                  : node.course.level === "advanced"
                    ? ShieldAlert
                    : state.current
                      ? Swords
                      : LockKeyhole;
              return (
                <div key={node.course.id}>
                  <Link
                    href={`/courses/${node.course.id}`}
                    data-course-id={node.course.id}
                    data-current={state.current || undefined}
                    className={[
                      "tower-encounter",
                      state.done ? "done" : "",
                      state.current ? "current" : "",
                      future ? "future" : "",
                      node.isBoss ? "boss" : "",
                      node.course.level === "advanced" && !node.isBoss ? "elite" : "",
                    ].filter(Boolean).join(" ")}
                    style={{ left: node.x - NODE_R, top: node.y - NODE_R }}
                    title={node.course.title}
                  >
                    {state.pct > 0 && state.pct < 100 && (
                      <i
                        className="tower-progress-ring"
                        style={{ background: `conic-gradient(var(--gold) ${state.pct}%, transparent 0)` }}
                      />
                    )}
                    <Icon aria-hidden size={node.isBoss ? 24 : 20} />
                    <small>F{String(node.index + 1).padStart(2, "0")}</small>
                  </Link>
                  <Link
                    href={`/courses/${node.course.id}`}
                    className="tower-encounter-label"
                    style={{ left: node.x - 112, top: node.y + 46 }}
                  >
                    <small>{node.course.code} · {node.course.episodes.length} 遭遇</small>
                    <b>{node.course.title}</b>
                    {state.current && <em>当前关卡</em>}
                    {state.done && <em>已讨伐</em>}
                  </Link>
                </div>
              );
            })}

            <div
              className="tower-base"
              data-tower-base
              style={{ top: tower.height - 86 }}
            >
              <span>G</span>
              <b>公会入口</b>
            </div>
          </div>
        </TowerViewport>
      </div>
    </div>
  );
}
