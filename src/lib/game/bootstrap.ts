import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getContent } from "../content/load";
import type { SessionUser } from "../auth/session";
import { db } from "../db/client";
import { xpEvents } from "../db/schema";
import { getUserProgress } from "../progress/queries";
import { learningStreak } from "./achievements";
import { dailyDateKey } from "./quests";
import { courseHasQuiz } from "./quiz-bank";
import { getRpgProfile } from "./rpg-server";
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

  const relics: RelicDto[] = rpg.relics.map((r) => ({
    id: r.item.id,
    title: r.item.title,
    subject: r.item.subject,
    rarity: r.item.rarity,
    quantity: r.quantity,
  }));
  const relicById = new Map(relics.map((r) => [r.id, r]));

  const courses: CourseSummaryDto[] = content.courses.map((c) => {
    const watchedSet = progress.watchedByCourse.get(c.id);
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

  const paths: PathSummaryDto[] = content.paths.map((p) => ({
    id: p.id,
    title: p.title,
    subject: p.subject,
    courseIds: p.stages.flatMap((s) => s.courses),
  }));

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
  };
}
