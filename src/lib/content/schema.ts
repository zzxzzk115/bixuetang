import { z } from "zod";

// ---------- 基础枚举 ----------

export const SUBJECTS = ["cs", "math", "physics", "ai"] as const;
export type Subject = (typeof SUBJECTS)[number];
export const SUBJECT_LABEL: Record<Subject, string> = {
  cs: "计算机",
  math: "数学",
  physics: "物理",
  ai: "人工智能",
};

export const LEVELS = ["basic", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<Level, string> = {
  basic: "基础",
  intermediate: "进阶",
  advanced: "高阶",
};
// XP 难度系数
export const LEVEL_FACTOR: Record<Level, number> = {
  basic: 1,
  intermediate: 1.5,
  advanced: 2,
};

const slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "id 须为小写字母/数字/连字符");

// ---------- 实验室 ----------

export const LAB_IDS = ["hack", "math"] as const;
export type LabId = (typeof LAB_IDS)[number];

export const LabTaskSchema = z.object({
  id: slug,
  title: z.string(),
  xp: z.number().int().positive(),
  description: z.string().optional(),
});
export type LabTask = z.infer<typeof LabTaskSchema>;

export const LabTasksSchema = z.object({
  lab: z.enum(LAB_IDS),
  tasks: z.array(LabTaskSchema).min(1),
});
export type LabTasks = z.infer<typeof LabTasksSchema>;

// ---------- 课程 ----------

export const SourceSchema = z.object({
  platform: z.enum(["bilibili", "youtube", "other"]),
  url: z.url(),
  /** 平台上的原始视频或播放列表标题。 */
  title: z.string().optional(),
  uploader: z.string().optional(),
  note: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const EpisodeSchema = z.object({
  n: z.number().int().positive(),
  title: z.string(),
  /**
   * 该集的独立视频 id（bilibili ugc_season 合集类课程，每集是独立稿件）。
   * 缺省时视为同一稿件的第 n 个分 P。
   */
  bvid: z.string().optional(),
  /** 视频时长（秒），由 fetch:episodes 从平台拉取；用于 XP 计分 */
  durationSec: z.number().int().positive().optional(),
});
export type Episode = z.infer<typeof EpisodeSchema>;

export const NoteLinkSchema = z.object({
  title: z.string(),
  url: z.url(),
  author: z.string().optional(),
  kind: z.enum(["github", "blog", "site"]).default("site"),
});
export type NoteLink = z.infer<typeof NoteLinkSchema>;

const CourseRawSchema = z
  .object({
    id: slug,
    title: z.string(),
    code: z.string().optional(),
    institution: z.string().optional(),
    instructor: z.string().optional(),
    subject: z.enum(SUBJECTS),
    level: z.enum(LEVELS),
    tags: z.array(z.string()).default([]),
    prerequisites: z.array(slug).default([]),
    estimatedHours: z.number().positive().optional(),
    description: z.string().optional(),
    sources: z.array(SourceSchema).min(1),
    // 二选一：逐集列出 episodes，或只给 episodeCount 自动生成「第 N 讲」
    episodes: z.array(EpisodeSchema).optional(),
    episodeCount: z.number().int().positive().optional(),
    notes: z.array(NoteLinkSchema).default([]),
    /** 附属实验室（/lab/<id> 页面），如 nand2tetris → hack */
    lab: z.enum(LAB_IDS).optional(),
  })
  .check((ctx) => {
    if (!ctx.value.episodes?.length && !ctx.value.episodeCount) {
      ctx.issues.push({
        code: "custom",
        message: "episodes 与 episodeCount 至少提供一个",
        input: ctx.value,
      });
    }
  });

export const CourseSchema = CourseRawSchema.transform((raw) => {
  const episodes: Episode[] =
    raw.episodes && raw.episodes.length > 0
      ? raw.episodes
      : Array.from({ length: raw.episodeCount! }, (_, i) => ({
          n: i + 1,
          title: `第 ${i + 1} 讲`,
        }));
  return { ...raw, episodes };
});
export type Course = z.infer<typeof CourseSchema>;

// ---------- 学习路径（课程的有序分组，不承载依赖语义） ----------

export const PathSchema = z.object({
  id: slug,
  title: z.string(),
  subject: z.enum(SUBJECTS),
  description: z.string().optional(),
  stages: z
    .array(
      z.object({
        title: z.string(),
        courses: z.array(slug).min(1),
      }),
    )
    .min(1),
});
export type LearningPath = z.infer<typeof PathSchema>;

// ---------- 技能树 ----------

export const SkillNodeSchema = z.object({
  id: slug,
  title: z.string(),
  subject: z.enum(SUBJECTS),
  tier: z.number().int().min(1), // 布局分层 + 属性加成权重
  cost: z.number().int().min(0).default(1), // 点亮所需技能点
  requires: z.array(slug).default([]), // 前置节点（DAG 边）
  courses: z.array(slug).min(1),
  rule: z.enum(["any", "all"]).default("any"),
  description: z.string().optional(),
});
export type SkillNode = z.infer<typeof SkillNodeSchema>;

export const SkillTreeSchema = z.object({
  nodes: z.array(SkillNodeSchema).min(1),
});

// ---------- AI 视频分析（content/analysis/<courseId>.json，技能生成） ----------

export const TimelinePointSchema = z.object({
  /** 秒；basis=titles-only 时缺省 */
  t: z.number().min(0).optional(),
  title: z.string(),
  detail: z.string().optional(),
  /** LaTeX，数学工坊联动入口 */
  formula: z.string().optional(),
});
export type TimelinePoint = z.infer<typeof TimelinePointSchema>;

export const EpisodeAnalysisSchema = z.object({
  n: z.number().int().positive(),
  summary: z.string(),
  keyPoints: z.array(TimelinePointSchema).default([]),
  terms: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .default([]),
});
export type EpisodeAnalysis = z.infer<typeof EpisodeAnalysisSchema>;

export const CourseAnalysisSchema = z.object({
  courseId: slug,
  generatedAt: z.string(),
  model: z.string(),
  /** 时间戳基于 sources[i]（不同源时间轴可能不同） */
  sourceIndex: z.number().int().min(0).default(0),
  /** 降级标记：titles-only = 无字幕，仅基于集标题与公开资料 */
  basis: z.enum(["subtitles", "titles-only"]).default("subtitles"),
  overview: z.string().optional(),
  episodes: z.array(EpisodeAnalysisSchema).min(1),
});
export type CourseAnalysis = z.infer<typeof CourseAnalysisSchema>;

// ---------- 职业 ----------

export const JobRequiresSchema = z.object({
  minLevel: z.number().int().min(1).optional(),
  skills: z
    .object({
      allOf: z.array(slug).default([]),
      anyOf: z.array(slug).default([]),
      minAnyOf: z.number().int().min(1).default(1),
    })
    .optional(),
});
export type JobRequires = z.infer<typeof JobRequiresSchema>;

export const JobSchema = z.object({
  id: slug,
  title: z.string(),
  tier: z.number().int().min(0).max(3), // 0=新手 1=一转 2=二转 3=三转（传说）
  parents: z.array(slug).default([]), // 多 parent = 兼修复合职业
  requires: JobRequiresSchema.default({}),
  description: z.string().optional(),
});
export type Job = z.infer<typeof JobSchema>;

export const JobsSchema = z.object({
  jobs: z.array(JobSchema).min(1),
});
