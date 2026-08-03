import "server-only";

import { getContent } from "../content/load";
import type { SessionUser } from "../auth/session";
import { getUserProgress } from "../progress/queries";
import { getRpgProfile } from "./rpg-server";
import { ZERO_STATS, type StatBlock } from "./relics";
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

  // G1：装备系统尚未接入，bonus 先全 0，base = 现有四维。G2 会让 getRpgProfile 直接给分列值。
  const base = toStatBlock(rpg.stats);
  const relics: RelicDto[] = rpg.relics.map((r) => ({
    id: r.item.id,
    title: r.item.title,
    subject: r.item.subject,
    rarity: r.item.rarity,
    quantity: r.quantity,
  }));

  const courses: CourseSummaryDto[] = content.courses.map((c) => ({
    id: c.id,
    title: c.title,
    code: c.code,
    subject: c.subject,
    level: c.level,
    episodeCount: c.episodes.length,
    watchedCount: progress.watchedByCourse.get(c.id)?.size ?? 0,
    status: progress.statusByCourse.get(c.id) ?? null,
  }));

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
      equipped: [],
      baseStats: base,
      bonusStats: { ...ZERO_STATS },
      stats: base,
      power: rpg.stats.power,
    },
    courses,
    paths,
    trialBest: {},
  };
}
