import "server-only";

import { and, eq, sql } from "drizzle-orm";
import {
  achievementUnlocks,
  courseProgress,
  episodeProgress,
  follows,
  leagueStanding,
  learningSessions,
  reviewCards,
  videoNotes,
  xpEvents,
} from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { getSubjectXp, getUserProgress } from "@/lib/progress/queries";
import { getStreak } from "./streak-server";
import { tierIndex } from "./league";
import { levelFromXp } from "./level";
import { recordFeed } from "./feed";

// 成就 = 分级「成就轨」:一个轨有多个等级(铜→银→金→钻→王),按同一指标逐级解锁。
// 指标全部由现有数据推导(看课/通关/连胜/笔记/术语/等级/专注/学科/段位/社交),无需额外埋点。
// 每达到一个新等级,幂等落一条 achievement_unlocks(id=`轨.等级下标`)并广播好友动态。

/** 等级名与配色(按下标) */
export const TIER_META = [
  { label: "铜", colorVar: "--app-brown" },
  { label: "银", colorVar: "--app-silver" },
  { label: "金", colorVar: "--app-gold" },
  { label: "钻", colorVar: "--app-blue" },
  { label: "王", colorVar: "--app-purple" },
] as const;

interface TierDef {
  need: number;
  /** 覆盖默认「达到 N 单位」描述(如段位轨用段位名) */
  desc?: string;
}

interface TrackDef {
  id: string;
  title: string;
  /** feed-list / achievements 页里映射到 lucide 图标的键 */
  icon: string;
  unit: string;
  tiers: TierDef[];
}

// ── 成就轨定义(等级从低到高)──────────────────────────────────────────
const TRACKS: TrackDef[] = [
  { id: "episodes", title: "看课人", icon: "play", unit: "集", tiers: t(10, 50, 150, 400, 1000) },
  { id: "courses", title: "通关者", icon: "trophy", unit: "门", tiers: t(1, 3, 10, 25) },
  { id: "streak", title: "不辍", icon: "flame", unit: "天", tiers: t(3, 7, 30, 100, 365) },
  { id: "notes", title: "笔记控", icon: "pen", unit: "条", tiers: t(5, 25, 100, 300) },
  { id: "terms", title: "词汇量", icon: "book", unit: "个", tiers: t(20, 100, 300, 800) },
  { id: "level", title: "修行", icon: "trending", unit: "级", tiers: t(5, 10, 20, 40) },
  { id: "focus", title: "专注", icon: "clock", unit: "小时", tiers: t(1, 10, 50, 200) },
  { id: "polymath", title: "博学", icon: "layers", unit: "科", tiers: t(2, 4, 6, 9) },
  {
    id: "league",
    title: "段位",
    icon: "medal",
    unit: "",
    tiers: [
      { need: 2, desc: "段位升到白银" },
      { need: 3, desc: "段位升到黄金" },
      { need: 5, desc: "段位升到钻石" },
      { need: 7, desc: "段位升到王者" },
    ],
  },
  { id: "social", title: "社交家", icon: "users", unit: "位好友", tiers: t(1, 5, 15) },
];

function t(...needs: number[]): TierDef[] {
  return needs.map((need) => ({ need }));
}

export interface TierView {
  label: string;
  colorVar: string;
  need: number;
  desc: string;
  unlocked: boolean;
  unlockedAt?: number;
}

export interface TrackView {
  id: string;
  title: string;
  icon: string;
  unit: string;
  value: number;
  tiers: TierView[];
  /** 已达到的最高等级下标,-1 表示一级都没到 */
  reachedIdx: number;
  /** 下一级门槛;已满级为 null */
  nextNeed: number | null;
}

function metrics(userId: number): Record<string, number> {
  const progress = getUserProgress(userId);
  const subjectXp = getSubjectXp(progress);
  const totalXp =
    db
      .select({ n: sql<number>`coalesce(sum(${xpEvents.amount}),0)` })
      .from(xpEvents)
      .where(eq(xpEvents.userId, userId))
      .get()?.n ?? 0;
  const count = (q: number | undefined) => q ?? 0;

  const episodesWatched = count(
    db
      .select({ n: sql<number>`count(*)` })
      .from(episodeProgress)
      .where(eq(episodeProgress.userId, userId))
      .get()?.n,
  );
  const coursesDone = count(
    db
      .select({ n: sql<number>`count(*)` })
      .from(courseProgress)
      .where(and(eq(courseProgress.userId, userId), eq(courseProgress.status, "done")))
      .get()?.n,
  );
  const notes = count(
    db
      .select({ n: sql<number>`count(*)` })
      .from(videoNotes)
      .where(eq(videoNotes.userId, userId))
      .get()?.n,
  );
  const terms = count(
    db
      .select({ n: sql<number>`count(*)` })
      .from(reviewCards)
      .where(and(eq(reviewCards.userId, userId), eq(reviewCards.kind, "term")))
      .get()?.n,
  );
  const focusMin = count(
    db
      .select({ n: sql<number>`coalesce(sum(${learningSessions.focusMinutes}),0)` })
      .from(learningSessions)
      .where(eq(learningSessions.userId, userId))
      .get()?.n,
  );
  const following = count(
    db
      .select({ n: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followerId, userId))
      .get()?.n,
  );
  const standing = db
    .select({ tier: leagueStanding.tier })
    .from(leagueStanding)
    .where(eq(leagueStanding.userId, userId))
    .get();

  return {
    episodes: episodesWatched,
    courses: coursesDone,
    streak: getStreak(userId).best,
    notes,
    terms,
    level: levelFromXp(totalXp),
    focus: Math.floor(focusMin / 60),
    polymath: Object.values(subjectXp).filter((v) => v > 0).length,
    league: standing ? tierIndex(standing.tier) : 1,
    social: following,
  };
}

/** 检测并解锁达成的成就等级(幂等);新达成的各落一条好友动态。返回全部成就轨视图。 */
export function syncAchievements(userId: number): TrackView[] {
  const m = metrics(userId);
  const before = new Set(
    db
      .select({ id: achievementUnlocks.achievementId })
      .from(achievementUnlocks)
      .where(eq(achievementUnlocks.userId, userId))
      .all()
      .map((r) => r.id),
  );
  const now = Date.now();

  const views: TrackView[] = TRACKS.map((track) => {
    const value = m[track.id] ?? 0;
    let reachedIdx = -1;
    const tiers: TierView[] = track.tiers.map((tier, i) => {
      const meta = TIER_META[Math.min(i, TIER_META.length - 1)];
      const id = `${track.id}.${i}`;
      const reached = value >= tier.need;
      if (reached) {
        reachedIdx = i;
        if (!before.has(id)) {
          db.insert(achievementUnlocks)
            .values({ userId, achievementId: id, unlockedAt: now })
            .onConflictDoNothing()
            .run();
          recordFeed(userId, "achievement", id, {
            title: `${track.title} · ${meta.label}`,
          });
        }
      }
      return {
        label: meta.label,
        colorVar: meta.colorVar,
        need: tier.need,
        desc: tier.desc ?? `${track.title}达到 ${tier.need}${track.unit}`,
        unlocked: reached,
      };
    });
    const next = track.tiers[reachedIdx + 1];
    return {
      id: track.id,
      title: track.title,
      icon: track.icon,
      unit: track.unit,
      value,
      tiers,
      reachedIdx,
      nextNeed: next ? next.need : null,
    };
  });

  // 补回 unlockedAt(供页面展示解锁日期)
  const unlockedAt = new Map(
    db
      .select()
      .from(achievementUnlocks)
      .where(eq(achievementUnlocks.userId, userId))
      .all()
      .map((r) => [r.achievementId, r.unlockedAt]),
  );
  for (const v of views) {
    v.tiers.forEach((tier, i) => {
      tier.unlockedAt = unlockedAt.get(`${v.id}.${i}`);
    });
  }
  return views;
}
