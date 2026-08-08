import type { GameBootstrap } from "./bootstrap-types";

// 「继续学习 / 下一步」推荐:纯函数,数据全来自 bootstrap(lastWatched 此前无人消费)。
// 治 PM 点名的「120 门课散着,不知道先学什么」——给一个明确的下一步。

export interface NextStep {
  /** 接着上次没看完的那一集 */
  continue: {
    courseId: string;
    title: string;
    episodeN: number;
    ratioPct: number;
  } | null;
  /** 推荐开始的下一门课(可学、还没开始) */
  next: { courseId: string; title: string; subject: string } | null;
}

export function pickNextStep(b: GameBootstrap): NextStep {
  const byId = new Map(b.courses.map((c) => [c.id, c]));

  let cont: NextStep["continue"] = null;
  if (b.lastWatched) {
    const c = byId.get(b.lastWatched.courseId);
    // 上次那门已全部学完就不再「继续」,让位给下一步
    if (c && c.watchedCount < c.episodeCount) {
      cont = {
        courseId: c.id,
        title: c.title,
        episodeN: b.lastWatched.episodeN,
        ratioPct: b.lastWatched.ratioPct,
      };
    }
  }

  const startable = (c: GameBootstrap["courses"][number]) =>
    c.unlocked && c.watchedCount === 0 && c.status !== "done";

  let next: NextStep["next"] = null;
  // 优先按当前路线的课程顺序找首门可学未学的
  const path = b.paths.find((p) => p.id === b.routeId);
  const order = path?.mode === "course" ? path.courseIds : [];
  for (const id of order) {
    const c = byId.get(id);
    if (c && startable(c) && c.id !== cont?.courseId) {
      next = { courseId: c.id, title: c.title, subject: c.subject };
      break;
    }
  }
  // 兜底:全库首门可学未学(优先基础课)
  if (!next) {
    const pool = b.courses
      .filter((c) => startable(c) && c.id !== cont?.courseId)
      .sort(
        (a, z) =>
          (a.level === "basic" ? 0 : 1) - (z.level === "basic" ? 0 : 1),
      );
    const c = pool[0];
    if (c) next = { courseId: c.id, title: c.title, subject: c.subject };
  }

  return { continue: cont, next };
}
