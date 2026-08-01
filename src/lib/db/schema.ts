import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// 所有时间戳均为 unix 毫秒。内容（课程/技能/职业）不入库，
// course_id / skill_id / job_id 存 content/ 里的 slug，应用层校验存在性。

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  activeJobId: text("active_job_id"),
  createdAt: integer("created_at").notNull(),
});

// DB 只存 token 的 SHA-256，泄库不泄 token
export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const COURSE_STATUSES = [
  "planned",
  "learning",
  "done",
  "dropped",
] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const courseProgress = sqliteTable(
  "course_progress",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull(),
    status: text("status", { enum: COURSE_STATUSES }).notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.courseId] })],
);

export const episodeProgress = sqliteTable(
  "episode_progress",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull(),
    episodeN: integer("episode_n").notNull(),
    watchedAt: integer("watched_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.courseId, t.episodeN] })],
);

// 只追加的经验流水；总 XP / 等级永远由此推导。
// (user_id, reason, ref) 唯一 → 幂等，反复勾选同一集不会重复得分。
export const xpEvents = sqliteTable(
  "xp_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    ref: text("ref").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("xp_events_user_reason_ref").on(t.userId, t.reason, t.ref),
  ],
);

// 加点动作记录，同时是技能点扣费凭证（已花费 = 该表行数的 cost 之和）
export const skillUnlocks = sqliteTable(
  "skill_unlocks",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
    unlockedAt: integer("unlocked_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.skillId] })],
);

export const jobUnlocks = sqliteTable(
  "job_unlocks",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id").notNull(),
    attainedAt: integer("attained_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.jobId] })],
);
