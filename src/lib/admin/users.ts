import "server-only";
import { desc, eq, like, or, sql } from "drizzle-orm";
import { getContent } from "../content/load";
import { db } from "../db/client";
import {
  biliAccounts,
  rpgInventory,
  rpgProfiles,
  streakState,
  users,
  videoReports,
} from "../db/schema";
import { levelFromXp } from "../game/level";
import { getUserProgress } from "../progress/queries";
import { requireAdmin } from "./session";

const PAGE_SIZE = 20;

export interface AdminUserRow {
  id: number;
  username: string;
  displayName: string | null;
  createdAt: number;
  coins: number;
  level: number;
}

export interface AdminUserList {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** 用户列表:按 用户名/昵称/id 搜索,分页。 */
export async function adminListUsers(
  q: string,
  page = 1,
): Promise<AdminUserList> {
  await requireAdmin();
  const term = q.trim();
  const idMatch = /^\d+$/.test(term) ? Number(term) : null;
  const where = term
    ? or(
        like(users.username, `%${term}%`),
        like(users.displayName, `%${term}%`),
        ...(idMatch !== null ? [eq(users.id, idMatch)] : []),
      )
    : undefined;

  const total =
    db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(where)
      .get()?.n ?? 0;

  const p = Math.max(1, page);
  const rows = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      createdAt: users.createdAt,
      coins: rpgProfiles.coins,
    })
    .from(users)
    .leftJoin(rpgProfiles, eq(rpgProfiles.userId, users.id))
    .where(where)
    .orderBy(desc(users.id))
    .limit(PAGE_SIZE)
    .offset((p - 1) * PAGE_SIZE)
    .all();

  // 等级由 xp 派生,逐行算(列表页用户数有限)
  const withLevel: AdminUserRow[] = rows.map((r) => {
    const prog = getUserProgress(r.id);
    return {
      id: r.id,
      username: r.username,
      displayName: r.displayName,
      createdAt: r.createdAt,
      coins: r.coins ?? 0,
      level: prog.level.level,
    };
  });

  return { rows: withLevel, total, page: p, pageSize: PAGE_SIZE };
}

export interface AdminCourseProgress {
  courseId: string;
  title: string;
  status: string | null;
  watched: number;
  episodes: number;
}

export interface AdminUserDetail {
  id: number;
  username: string;
  displayName: string | null;
  avatar: string | null;
  createdAt: number;
  bili: { mid: string; nickname: string | null } | null;
  totalXp: number;
  level: number;
  coins: number;
  shieldHearts: number;
  equipSlots: number;
  streak: { current: number; best: number; freezes: number } | null;
  inventory: { itemId: string; quantity: number }[];
  courses: AdminCourseProgress[];
  recentReports: {
    id: number;
    courseId: string;
    episodeN: number;
    kind: string;
    resolved: boolean;
    createdAt: number;
  }[];
}

/** 单个用户的运营全貌:进度、等级、金币、护盾、道具、连胜、bili、近期反馈。 */
export async function adminGetUserDetail(
  userId: number,
): Promise<AdminUserDetail | null> {
  await requireAdmin();
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;

  const prog = getUserProgress(userId);
  const rpg = db
    .select()
    .from(rpgProfiles)
    .where(eq(rpgProfiles.userId, userId))
    .get();
  const streak = db
    .select()
    .from(streakState)
    .where(eq(streakState.userId, userId))
    .get();
  const bili = db
    .select()
    .from(biliAccounts)
    .where(eq(biliAccounts.userId, userId))
    .get();
  const inventory = db
    .select({ itemId: rpgInventory.itemId, quantity: rpgInventory.quantity })
    .from(rpgInventory)
    .where(eq(rpgInventory.userId, userId))
    .all();
  const reports = db
    .select({
      id: videoReports.id,
      courseId: videoReports.courseId,
      episodeN: videoReports.episodeN,
      kind: videoReports.kind,
      resolved: videoReports.resolved,
      createdAt: videoReports.createdAt,
    })
    .from(videoReports)
    .where(eq(videoReports.userId, userId))
    .orderBy(desc(videoReports.createdAt))
    .limit(10)
    .all();

  // 有任何进度(在学/已看)的课程,按内容标题补全
  const content = getContent();
  const courseIds = new Set<string>([
    ...prog.statusByCourse.keys(),
    ...prog.watchedByCourse.keys(),
  ]);
  const courses: AdminCourseProgress[] = [...courseIds]
    .map((cid) => {
      const c = content.coursesById.get(cid);
      return {
        courseId: cid,
        title: c?.title ?? cid,
        status: prog.statusByCourse.get(cid) ?? null,
        watched: prog.watchedByCourse.get(cid)?.size ?? 0,
        episodes: c?.episodes.length ?? 0,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "zh"));

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    createdAt: user.createdAt,
    bili: bili ? { mid: bili.mid, nickname: bili.nickname } : null,
    totalXp: prog.totalXp,
    level: levelFromXp(prog.totalXp),
    coins: rpg?.coins ?? 0,
    shieldHearts: rpg?.shieldHearts ?? 0,
    equipSlots: rpg?.equipSlots ?? 3,
    streak: streak
      ? { current: streak.current, best: streak.best, freezes: streak.freezes }
      : null,
    inventory,
    courses,
    recentReports: reports.map((r) => ({ ...r, resolved: !!r.resolved })),
  };
}
