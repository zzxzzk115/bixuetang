import { SkillTree, type SkillNodeView } from "@/components/skill-tree";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { skillPointsEarned } from "@/lib/game/level";
import { computeSkillViews, spentPoints } from "@/lib/game/skills";
import { layoutTree } from "@/lib/game/tree-layout";
import { doneCourseIds, getUserProgress } from "@/lib/progress/queries";

export const metadata = { title: "技能星盘" };

export default async function SkillTreePage() {
  const content = getContent();
  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;

  const done = progress ? doneCourseIds(progress) : new Set<string>();
  const lit = progress?.litSkills ?? new Set<string>();
  const points = progress
    ? skillPointsEarned(progress.level.level) -
      spentPoints(content.skillNodes, lit)
    : 0;

  const layout = layoutTree(content.skillNodes);
  const views: Record<string, SkillNodeView> = {};
  for (const view of computeSkillViews(content.skillNodes, done, lit)) {
    views[view.node.id] = {
      id: view.node.id,
      state: view.state,
      coursesMet: view.coursesMet,
      requiresMet: view.requiresMet,
      courses: view.node.courses.map((courseId) => ({
        id: courseId,
        title: content.coursesById.get(courseId)?.title ?? courseId,
        done: done.has(courseId),
      })),
      requires: view.node.requires.map((requiredId) => ({
        id: requiredId,
        title: content.skillById.get(requiredId)?.title ?? requiredId,
        lit: lit.has(requiredId),
      })),
      jobs: content.jobs
        .filter((job) => {
          const skills = job.requires.skills;
          return (
            !!skills &&
            (skills.allOf.includes(view.node.id) ||
              skills.anyOf.includes(view.node.id))
          );
        })
        .map((job) => ({
          id: job.id,
          title: job.title,
          tier: job.tier,
          required: !!job.requires.skills?.allOf.includes(view.node.id),
        })),
    };
  }

  return (
    <div className="page-stack">
      <header className="page-intro">
        <div>
          <p className="page-kicker">MASTERY CONSTELLATION</p>
          <h1 className="page-title">技能星盘</h1>
          <p className="page-lead">
            课程通关只代表获得学习资格。把有限技能点投入节点，才能形成你的职业构筑；
            中心向外依次是基础能力、专业分支与高阶专精。
          </p>
        </div>
        {user && (
          <div className="flex gap-2 font-mono text-xs">
            <span className="border border-edge bg-panel px-3 py-2">
              MASTERED <b className="text-gold">{lit.size}</b> /{" "}
              {content.skillNodes.length}
            </span>
            <span className="border border-edge bg-panel px-3 py-2">
              SKILL POINTS <b className="text-mana">{points}</b>
            </span>
          </div>
        )}
      </header>

      {!user && (
        <p className="hud-panel px-4 py-3 text-sm text-muted">
          <a href="/login" className="text-gold underline">
            登录角色档案
          </a>
          ，即可查看可点亮节点、投入技能点并保存职业构筑。
        </p>
      )}

      <SkillTree
        layout={layout}
        views={views}
        points={points}
        loggedIn={!!user}
      />
    </div>
  );
}
