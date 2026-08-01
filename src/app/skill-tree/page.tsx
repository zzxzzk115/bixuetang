import { SkillTree, type SkillNodeView } from "@/components/skill-tree";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { skillPointsEarned } from "@/lib/game/level";
import { computeSkillViews, spentPoints } from "@/lib/game/skills";
import { layoutTree } from "@/lib/game/tree-layout";
import { doneCourseIds, getUserProgress } from "@/lib/progress/queries";

export const metadata = { title: "技能树" };

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
  for (const v of computeSkillViews(content.skillNodes, done, lit)) {
    views[v.node.id] = {
      id: v.node.id,
      state: v.state,
      coursesMet: v.coursesMet,
      requiresMet: v.requiresMet,
      courses: v.node.courses.map((cid) => ({
        id: cid,
        title: content.coursesById.get(cid)?.title ?? cid,
        done: done.has(cid),
      })),
      requires: v.node.requires.map((rid) => ({
        id: rid,
        title: content.skillById.get(rid)?.title ?? rid,
        lit: lit.has(rid),
      })),
    };
  }

  const litCount = lit.size;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">技能树</h1>
          <p className="mt-1 text-sm text-muted">
            通关关联课程解锁资格，再花技能点点亮——每升 1 级获得 1 点。
          </p>
        </div>
        {user && (
          <div className="flex gap-2 text-sm">
            <span className="rounded border border-edge bg-panel px-3 py-1.5">
              已点亮 <b className="text-gold">{litCount}</b> /{" "}
              {content.skillNodes.length}
            </span>
            <span className="rounded border border-edge bg-panel px-3 py-1.5">
              技能点 <b className="text-mana">{points}</b>
            </span>
          </div>
        )}
      </div>

      {!user && (
        <p className="mb-4 rounded border border-edge bg-panel px-4 py-3 text-sm text-muted">
          <a href="/login" className="text-gold underline">
            登录
          </a>
          后可查看自己的点亮进度并加点
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
