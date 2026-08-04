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
  // 头像：`preset:<id>` 指向内置像素头像，`upload:<版本号>` 指向 <数据目录>/avatars/<userId>.png。
  // 版本号用于给 <img> 加 query 破缓存——文件名固定为 userId，换图后 URL 不变。
  // 空值回退到用户名首字母色块。
  avatar: text("avatar"),
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

// 浏览器插件用的长效 token：插件跨域拿不到 cookie，改用 Bearer token。
// 与 sessions 一样只存 SHA-256。
export const apiTokens = sqliteTable("api_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
});

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


export const learningSessions = sqliteTable(
  "learning_sessions",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull(),
    episodeN: integer("episode_n").notNull(),
    focusMinutes: integer("focus_minutes").notNull().default(0),
    summary: text("summary"),
    startedAt: integer("started_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.courseId, t.episodeN] })],
);

export const checkpointAttempts = sqliteTable(
  "checkpoint_attempts",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull(),
    episodeN: integer("episode_n").notNull(),
    checkpointId: text("checkpoint_id").notNull(),
    response: text("response").notNull(),
    passed: integer("passed", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.userId, t.courseId, t.episodeN, t.checkpointId],
    }),
  ],
);

export const questInstances = sqliteTable(
  "quest_instances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dateKey: text("date_key").notNull(),
    kind: text("kind").notNull(),
    courseId: text("course_id").notNull(),
    episodeN: integer("episode_n").notNull(),
    target: integer("target").notNull(),
    rewardXp: integer("reward_xp").notNull(),
    claimedAt: integer("claimed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("quest_instances_user_date_kind").on(
      t.userId,
      t.dateKey,
      t.kind,
    ),
  ],
);

export const achievementUnlocks = sqliteTable(
  "achievement_unlocks",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    achievementId: text("achievement_id").notNull(),
    unlockedAt: integer("unlocked_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievementId] })],
);


export const rpgProfiles = sqliteTable("rpg_profiles", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  coins: integer("coins").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const rpgLootEvents = sqliteTable(
  "rpg_loot_events",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull(),
    episodeN: integer("episode_n").notNull(),
    encounterType: text("encounter_type").notNull(),
    coins: integer("coins").notNull(),
    itemId: text("item_id"),
    rarity: text("rarity"),
    ruleVersion: integer("rule_version").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.courseId, t.episodeN] })],
);

// 经验加成（药水）：每人同时只有一个生效中的加成。
// multiplier_pct：150=x1.5、300=x3。
// 按「还能加成几集」计数（不是时间）——长视频课不会喝了药水看不完一集就过期。
export const xpBoosts = sqliteTable("xp_boosts", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  multiplierPct: integer("multiplier_pct").notNull(),
  episodesLeft: integer("episodes_left").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

// B 站账号绑定（扫码登录换取的凭据）。凭据只在服务端使用，不下发客户端。
export const biliAccounts = sqliteTable("bili_accounts", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** B 站 uid */
  mid: text("mid").notNull(),
  nickname: text("nickname"),
  avatarUrl: text("avatar_url"),
  sessdata: text("sessdata").notNull(),
  biliJct: text("bili_jct"),
  refreshToken: text("refresh_token"),
  expiresAt: integer("expires_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// 单集观看进度（自研播放器上报）：看到哪、看了多少、是否达标
export const episodeWatch = sqliteTable(
  "episode_watch",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull(),
    episodeN: integer("episode_n").notNull(),
    positionSec: integer("position_sec").notNull().default(0),
    durationSec: integer("duration_sec").notNull().default(0),
    /** 观看覆盖率 ×100（0~100），≥ 90 视为看完 */
    ratioPct: integer("ratio_pct").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.courseId, t.episodeN] })],
);

// 幽灵对战的对局记录：seed 决定题目（题库稳定时可复现），outcomes 是逐题
// 时间线 JSON [{c:0|1, t:毫秒}]——别人挑战我时回放这条时间线当「幽灵」。
export const pkRuns = sqliteTable("pk_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  seed: integer("seed").notNull(),
  questionCount: integer("question_count").notNull(),
  score: integer("score").notNull(),
  totalMs: integer("total_ms").notNull(),
  outcomes: text("outcomes").notNull(),
  createdAt: integer("created_at").notNull(),
});

// 排位分（ELO）。行不存在视为初始 1000 分。
export const pkRatings = sqliteTable("pk_ratings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull().default(1000),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

// 装备栏：槽位 → 遗物种类的引用，不消耗数量（加成随持有总量涨，见 relics.ts）。
// 与 rpg_inventory 分表：inventory 行是数量聚合（掉落链路 PK upsert quantity+1），
// 装备是引用语义，混在一起会把两条写路径搅在一张表上。
export const rpgEquipment = sqliteTable(
  "rpg_equipment",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slot: integer("slot").notNull(),
    itemId: text("item_id").notNull(),
    equippedAt: integer("equipped_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.slot] }),
    // 同一遗物只能占一个槽
    uniqueIndex("rpg_equipment_user_item").on(t.userId, t.itemId),
  ],
);

export const rpgInventory = sqliteTable(
  "rpg_inventory",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    quantity: integer("quantity").notNull().default(0),
    acquiredAt: integer("acquired_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);
