import {
  index,
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
  /** 拉新归因:经谁的分享链接(?ref=<userId>)注册来的;空=自然流量 */
  referredBy: integer("referred_by"),
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
  /** 装备槽数:默认 3,商店购买扩容,上限见 relics.MAX_EQUIP_SLOTS */
  equipSlots: integer("equip_slots").notNull().default(3),
  /** 护盾血(以撒式蓝心):试炼里先于红心被扣、用完即消、不占血上限;
   *  学习结算有几率掉落,上限见 relics.MAX_SHIELD_HEARTS */
  shieldHearts: integer("shield_hearts").notNull().default(0),
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

// 经验加成（药水）：每人一行,同时可有两种加成并存——
//  · 按次(episodesLeft):只作用于课程完成(整集/章节)结算,喝一瓶顶几次;
//  · 按时长(timed):激活后一段时间内所有「学习所得 XP」×倍率(墙钟计时,
//    跨课程/试炼/测验/复习通吃)——「全局」加成,任务奖励只发这类。
// multiplier_pct：150=x1.5、300=x3。
export const xpBoosts = sqliteTable("xp_boosts", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  multiplierPct: integer("multiplier_pct").notNull(),
  episodesLeft: integer("episodes_left").notNull().default(0),
  /** 时长型加成倍率(0=无) */
  timedMultiplierPct: integer("timed_multiplier_pct").notNull().default(0),
  /** 时长型加成到期的 unix 毫秒(now 超过即失效) */
  timedExpiresAt: integer("timed_expires_at").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

// 用户的学习状态（跨设备该一致的东西）：当前选的冒险路线、最后学的那一集。
// 划分原则：属于「这个人的学习状态」→ 数据库；属于「这台设备的观看偏好」
// （音量/倍速/弹幕字幕样式）→ localStorage。
export const userState = sqliteTable("user_state", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  routeId: text("route_id"),
  lastCourseId: text("last_course_id"),
  lastEpisodeN: integer("last_episode_n"),
  /** 播放器偏好 JSON（音量/倍速/弹幕/字幕/清晰度）——换设备也跟着走 */
  playerPrefs: text("player_prefs"),
  /** 首次运行引导完成/跳过的时间戳;空=还没引导过(新用户首屏弹欢迎) */
  onboardedAt: integer("onboarded_at"),
  updatedAt: integer("updated_at").notNull(),
});

// bilibili 账号绑定（扫码登录换取的凭据）。凭据只在服务端使用，不下发客户端。
// mid 唯一：一个 bilibili 账号只能绑到一个必学堂账号，否则扫码登录会落到
// 不确定的那个账号上（见迁移 0025）。
export const biliAccounts = sqliteTable(
  "bili_accounts",
  {
    userId: integer("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** bilibili uid */
    mid: text("mid").notNull(),
    nickname: text("nickname"),
    avatarUrl: text("avatar_url"),
    sessdata: text("sessdata").notNull(),
    biliJct: text("bili_jct"),
    refreshToken: text("refresh_token"),
    expiresAt: integer("expires_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("bili_accounts_mid_unique").on(t.mid)],
);

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
    /** 分段覆盖率数组的 JSON(各段 ×100,段定义见 src/lib/segments.ts) */
    segmentsJson: text("segments_json"),
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

// 字幕缓存。bilibili 的 player/v2 返回极不稳定——同一个 cid 连查 4 次，
// 常常 3 次只给 AI 轨、1 次才带人工轨；而 AI 轨还经常是别的视频的内容。
// 所以「曾经成功拿到过人工轨」这件事必须持久化，进程重启也不能丢：
// 有人工轨的结果永久有效，只有 AI 轨的结果短期过期后继续碰运气。
export const subtitleCache = sqliteTable("subtitle_cache", {
  /** 分 P 的 cid，字幕以它为准 */
  cid: integer("cid").primaryKey(),
  bvid: text("bvid").notNull(),
  /** SubtitleTrack[] 的 JSON */
  tracksJson: text("tracks_json").notNull(),
  /** 是否含人工字幕轨（1 = 永久有效，不必再查） */
  hasHuman: integer("has_human").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
  /**
   * UP 主标的视频章节（player/v2 的 view_points），ViewPoint[] 的 JSON。
   * 章节不会变，取到一次永久有效；确认没有章节的存 "[]"，免得反复回源。
   * null = 还没查过。
   */
  viewPointsJson: text("view_points_json"),
});

// 字幕时间轴偏移(旧·全局)。有些搬运稿件的字幕整体早／晚半秒到几秒，
// 这是稿件本身的问题，只能让用户自己校准；按 cid 记，跟人走。
// 已被下面的按轨道偏移取代,保留作老数据的兜底基底。
export const ccOffsets = sqliteTable(
  "cc_offsets",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cid: integer("cid").notNull(),
    /** 正数=字幕延后出现，毫秒 */
    offsetMs: integer("offset_ms").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cid] })],
);

// 按「轨道」的字幕偏移:中文轨对齐、YouTube 英文轨慢半秒是常态
// (自动轨 rolling caption 天然滞后),全局一个偏移调不动这种局面。
// 同时它就是众包数据:某视频某轨报告人数最多的非零偏移,会作为
// 没校准过的用户的默认值下发(用户自己的设置永远优先)。
export const ccTrackOffsets = sqliteTable(
  "cc_track_offsets",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cid: integer("cid").notNull(),
    /** 轨道标识(SubtitleTrack.lan:zh-Hans / ai-zh / yt-en …) */
    lan: text("lan").notNull(),
    /** 正数=字幕延后出现,毫秒 */
    offsetMs: integer("offset_ms").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.cid, t.lan] }),
    index("cc_track_offsets_cid_lan").on(t.cid, t.lan),
  ],
);

// 扫码登录时如果这个 bilibili 账号还没绑过任何本站账号，就先把凭据
// 暂存在这里，等用户填完用户名和密码再建号——不然账号只能靠扫码进，
// 换个设备没 bilibili App 就进不来了。凭据不下发到浏览器，前端只拿 token。
export const pendingBiliSignups = sqliteTable("pending_bili_signups", {
  token: text("token").primaryKey(),
  mid: text("mid").notNull(),
  nickname: text("nickname"),
  avatarUrl: text("avatar_url"),
  sessdata: text("sessdata").notNull(),
  biliJct: text("bili_jct"),
  refreshToken: text("refresh_token"),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

// 间隔重复复习卡。看完一集,该集的术语/知识点入卡(每集上限见
// review-enqueue),按 SM-2 简化版调度(src/lib/game/srs.ts)。
// (user,course,episode,kind,prompt) 唯一 → 重复看同一集不会重复入卡。
export const reviewCards = sqliteTable(
  "review_cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull(),
    episodeN: integer("episode_n").notNull(),
    /** term | keypoint(对应 quiz bank 的条目类型) */
    kind: text("kind").notNull(),
    /** 题面(quiz bank 条目的 prompt,用于反查出题) */
    prompt: text("prompt").notNull(),
    /** 下次到期学习日(dayKey,UTC+8) */
    dueDay: text("due_day").notNull(),
    intervalDays: integer("interval_days").notNull().default(0),
    /** ease ×100 整数(SM-2 的 2.3 存 230) */
    ease: integer("ease").notNull().default(230),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    lastReviewedAt: integer("last_reviewed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("review_cards_identity").on(
      t.userId,
      t.courseId,
      t.episodeN,
      t.kind,
      t.prompt,
    ),
    index("review_cards_due").on(t.userId, t.dueDay),
  ],
);

// 视频笔记:挂在具体某一集的某个时间戳上,Markdown 正文,只对本人可见。
// 点时间戳跳播放器;全屏速记层与页面笔记面板写同一张表。
export const videoNotes = sqliteTable(
  "video_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull(),
    episodeN: integer("episode_n").notNull(),
    /** 笔记锚定的视频秒数 */
    tSec: integer("t_sec").notNull().default(0),
    contentMd: text("content_md").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("video_notes_user_episode").on(t.userId, t.courseId, t.episodeN),
  ],
);

// 视频失效反馈。用户点「视频不见了」时落一行,运营据此换备用搬运。
// 同一 (用户,课程,集,稿件) 只记最近一次(onConflict 更新时间戳),防刷屏。
export const videoReports = sqliteTable(
  "video_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull(),
    episodeN: integer("episode_n").notNull(),
    /** 报错时正在尝试的稿件号(主源或某个备源) */
    bvid: text("bvid").notNull(),
    /** 反馈类型:gone=打不开/下架,wrong=内容不对,other */
    kind: text("kind").notNull().default("gone"),
    note: text("note"),
    /** 运营是否已处理 */
    resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("video_reports_uniq").on(
      t.userId,
      t.courseId,
      t.episodeN,
      t.bvid,
    ),
    index("video_reports_course").on(t.courseId, t.episodeN),
  ],
);

// ---- 独立管理端(admin. 子域)---- //
// 与游戏 users/sessions 完全隔离:管理员是运营账户,不是玩家。

export const adminUsers = sqliteTable("admin_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** 首启播种的默认账户密码是弱口令,强制首登修改 */
  mustChangePassword: integer("must_change_password", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at").notNull(),
});

export const adminSessions = sqliteTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  adminUserId: integer("admin_user_id")
    .notNull()
    .references(() => adminUsers.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

// 管理端所有改动的留痕(谁在何时对哪个玩家做了什么)。玩家删号后保留记录,
// 故 target_user_id 可空且 SET NULL。
export const adminAudit = sqliteTable(
  "admin_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    adminUserId: integer("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    targetUserId: integer("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** 操作细节(JSON 文本):前后值、课程 id、金额等 */
    detail: text("detail"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("admin_audit_target").on(t.targetUserId)],
);

// 连胜状态。派生自 xp_events 的旧算法要全表扫且 UTC 日切,
// 冻结道具(损失厌恶的安全阀)也必须有持久状态才能实现。
export const streakState = sqliteTable("streak_state", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  current: integer("current").notNull().default(0),
  best: integer("best").notNull().default(0),
  /** 最后一次学习行为的 dayKey(UTC+8);空串=从没学过 */
  lastDay: text("last_day").notNull().default(""),
  /** 连胜冻结存量(商店购买,断一天时自动消耗) */
  freezes: integer("freezes").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});
