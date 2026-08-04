import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getContent } from "../content/load";
import type { SessionUser } from "../auth/session";
import { db } from "../db/client";
import { xpEvents } from "../db/schema";
import { getUserProgress } from "../progress/queries";
import { computeUnlocks } from "./unlock";
import { learningStreak } from "./achievements";
import { getActiveBoost } from "./boosts";
import { dailyDateKey } from "./quests";
import { courseHasQuiz } from "./quiz-bank";
import { getRpgProfile } from "./rpg-server";
import { getUserState } from "./user-state";
import type { StatBlock } from "./relics";
import type {
  CourseSummaryDto,
  GameBootstrap,
  PathSummaryDto,
  RelicDto,
} from "./bootstrap-types";

// 全屏游戏一次性注水：/play 是 server component，把玩家状态 + 内容摘要聚合成
// 一个可序列化对象传给 GameShell，存进 game.registry。之后场景从 registry 读，
// 变更走 server action 返回值增量更新（见 bridge.ts），不再回查数据库。
//
// 只放「进游戏那一刻要用的」——课程/路径给摘要而非全量（分集标题等留到开课程窗口时再拉）。

function toStatBlock(s: {
  insight: number;
  focus: number;
  precision: number;
  resolve: number;
}): StatBlock {
  return {
    insight: s.insight,
    focus: s.focus,
    precision: s.precision,
    resolve: s.resolve,
  };
}

export function getGameBootstrap(user: SessionUser): GameBootstrap {
  const content = getContent();
  const progress = getUserProgress(user.id);
  const rpg = getRpgProfile(user.id);
  const state = getUserState(user.id);

  const relics: RelicDto[] = rpg.relics.map((r) => ({
    id: r.item.id,
    title: r.item.title,
    subject: r.item.subject,
    rarity: r.item.rarity,
    quantity: r.quantity,
  }));
  const relicById = new Map(relics.map((r) => [r.id, r]));

  // 解锁状态要在所有课程都算完完成度之后才能定，先备一份输入
  const unlockInputs = content.courses.map((c) => ({
    id: c.id,
    prerequisites: c.prerequisites,
    episodeCount: c.episodes.length,
    watchedCount: progress.watchedByCourse.get(c.id)?.size ?? 0,
    done: progress.statusByCourse.get(c.id) === "done",
  }));
  const unlocks = computeUnlocks(unlockInputs);
  const titleById = new Map(content.courses.map((c) => [c.id, c.title]));

  const courses: CourseSummaryDto[] = content.courses.map((c) => {
    const watchedSet = progress.watchedByCourse.get(c.id);
    const unlock = unlocks.get(c.id);
    return {
      id: c.id,
      title: c.title,
      code: c.code,
      subject: c.subject,
      level: c.level,
      episodeCount: c.episodes.length,
      watchedCount: watchedSet?.size ?? 0,
      status: progress.statusByCourse.get(c.id) ?? null,
      episodeNs: c.episodes.map((e) => e.n),
      watched: watchedSet ? [...watchedSet] : [],
      hasQuiz: courseHasQuiz(c.id),
      prerequisites: c.prerequisites,
      unlocked: unlock?.unlocked ?? true,
      missingPrereqs: (unlock?.missing ?? []).map((id) => ({
        id,
        title: titleById.get(id) ?? id,
      })),
    };
  });

  // 测验/宝箱/今日试炼的领取记录都在 xp_events 里（幂等键即完成标记）
  const claimRows = db
    .select({ reason: xpEvents.reason, ref: xpEvents.ref })
    .from(xpEvents)
    .where(
      and(
        eq(xpEvents.userId, user.id),
        inArray(xpEvents.reason, ["quiz", "chest", "trial"]),
      ),
    )
    .all();
  const quizDone = claimRows.filter((r) => r.reason === "quiz").map((r) => r.ref);
  const chestDone = claimRows
    .filter((r) => r.reason === "chest")
    .map((r) => r.ref);
  const trialClaimedToday = claimRows.some(
    (r) => r.reason === "trial" && r.ref === dailyDateKey(),
  );

  const courseById = new Map(courses.map((c) => [c.id, c]));
  const paths: PathSummaryDto[] = content.paths.map((p) => {
    const courseIds = p.stages.flatMap((s) => s.courses);
    // 路线是线性的：第一门课打不开，这条线就没法从头走，整条锁住。
    // 例外是已经在这条线上学过东西的人——那就让他继续。
    const first = courseIds.map((id) => courseById.get(id)).find(Boolean);
    const started = courseIds.some(
      (id) => (courseById.get(id)?.watchedCount ?? 0) > 0,
    );
    const unlocked = (first?.unlocked ?? true) || started;
    return {
      id: p.id,
      title: p.title,
      subject: p.subject,
      courseIds,
      unlocked,
      missingPrereqs: unlocked ? [] : (first?.missingPrereqs ?? []),
    };
  });

  return {
    user: { id: user.id, name: user.displayName || user.username, avatar: user.avatar },
    level: {
      level: progress.level.level,
      totalXp: progress.totalXp,
      current: progress.level.current,
      span: progress.level.span,
      ratio: progress.level.ratio,
    },
    rpg: {
      coins: rpg.coins,
      relics,
      equipped: rpg.equipped
        .map((e) => {
          const item = relicById.get(e.item.id);
          return item ? { slot: e.slot, item } : null;
        })
        .filter((e): e is { slot: number; item: RelicDto } => e !== null),
      baseStats: rpg.baseStats,
      bonusStats: rpg.bonusStats,
      stats: toStatBlock(rpg.stats),
      power: rpg.stats.power,
    },
    courses,
    paths,
    streak: learningStreak(user.id),
    trialBest: {},
    quizDone,
    chestDone,
    trialClaimedToday,
    boost: getActiveBoost(user.id),
    routeId: state.routeId,
    lastWatched: state.last,
  };
}
