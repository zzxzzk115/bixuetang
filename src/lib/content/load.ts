import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  CourseAnalysisSchema,
  CourseSchema,
  LabTasksSchema,
  PathSchema,
  ShadowUnitSchema,
  type Course,
  type CourseAnalysis,
  type LabId,
  type LabTasks,
  type LearningPath,
  type ShadowUnit,
} from "./schema";

export interface ContentIndex {
  courses: Course[];
  coursesById: Map<string, Course>;
  paths: LearningPath[];
  pathsById: Map<string, LearningPath>;
  labTasksById: Map<LabId, LabTasks>;
  analysisByCourse: Map<string, CourseAnalysis>;
  /** 影子跟读单元（口语训练，与课程体系并行） */
  shadowUnits: ShadowUnit[];
  shadowUnitsById: Map<string, ShadowUnit>;
}

export class ContentError extends Error {
  constructor(public problems: string[]) {
    super(`内容校验失败（${problems.length} 处）:\n` + problems.join("\n"));
    this.name = "ContentError";
  }
}

function contentDir(): string {
  return process.env.CONTENT_DIR ?? path.join(process.cwd(), "content");
}

function listYamlFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listYamlFiles(full));
    else if (/\.ya?ml$/.test(entry.name)) out.push(full);
  }
  return out;
}

function readYaml(file: string): unknown {
  return parseYaml(fs.readFileSync(file, "utf-8"));
}

/** 全量加载 + 校验 + 交叉引用检查。校验失败抛 ContentError。 */
export function loadContent(): ContentIndex {
  const root = contentDir();
  const problems: string[] = [];
  const rel = (f: string) => path.relative(root, f).replaceAll("\\", "/");

  // ---- 课程 ----
  const courses: Course[] = [];
  for (const file of listYamlFiles(path.join(root, "courses"))) {
    const parsed = CourseSchema.safeParse(readYaml(file));
    if (parsed.success) courses.push(parsed.data);
    else
      problems.push(
        `courses/${rel(file)}: ${parsed.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; ")}`,
      );
  }
  const coursesById = new Map<string, Course>();
  for (const c of courses) {
    if (coursesById.has(c.id)) problems.push(`课程 id 重复: ${c.id}`);
    coursesById.set(c.id, c);
  }
  for (const c of courses) {
    for (const p of c.prerequisites) {
      if (!coursesById.has(p))
        problems.push(`课程 ${c.id} 的前置课程不存在: ${p}`);
    }
  }

  // ---- 路径 ----
  const paths: LearningPath[] = [];
  for (const file of listYamlFiles(path.join(root, "paths"))) {
    const parsed = PathSchema.safeParse(readYaml(file));
    if (parsed.success) paths.push(parsed.data);
    else
      problems.push(
        `paths/${rel(file)}: ${parsed.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; ")}`,
      );
  }
  const pathsById = new Map<string, LearningPath>();
  for (const p of paths) {
    if (pathsById.has(p.id)) problems.push(`路径 id 重复: ${p.id}`);
    pathsById.set(p.id, p);
    for (const stage of p.stages) {
      for (const cid of stage.courses) {
        if (!coursesById.has(cid))
          problems.push(`路径 ${p.id} 引用了不存在的课程: ${cid}`);
      }
    }
  }

  // ---- 实验室任务 ----
  const labTasksById = new Map<LabId, LabTasks>();
  for (const file of listYamlFiles(path.join(root, "labs"))) {
    const parsed = LabTasksSchema.safeParse(readYaml(file));
    if (!parsed.success) {
      problems.push(
        `labs/${rel(file)}: ${parsed.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; ")}`,
      );
      continue;
    }
    const lab = parsed.data;
    if (labTasksById.has(lab.lab)) problems.push(`实验室任务重复定义: ${lab.lab}`);
    const seen = new Set<string>();
    for (const t of lab.tasks) {
      if (seen.has(t.id)) problems.push(`实验室 ${lab.lab} 任务 id 重复: ${t.id}`);
      seen.add(t.id);
    }
    labTasksById.set(lab.lab, lab);
  }

  // ---- AI 视频分析 ----
  const analysisByCourse = new Map<string, CourseAnalysis>();
  const analysisDir = path.join(root, "analysis");
  if (fs.existsSync(analysisDir)) {
    for (const entry of fs.readdirSync(analysisDir)) {
      if (!entry.endsWith(".json")) continue;
      const file = path.join(analysisDir, entry);
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(file, "utf-8"));
      } catch {
        problems.push(`analysis/${entry}: JSON 解析失败`);
        continue;
      }
      const parsed = CourseAnalysisSchema.safeParse(raw);
      if (!parsed.success) {
        problems.push(
          `analysis/${entry}: ${parsed.error.issues
            .map((i) => `${i.path.join(".")} ${i.message}`)
            .join("; ")}`,
        );
        continue;
      }
      const a = parsed.data;
      if (entry !== `${a.courseId}.json`) {
        problems.push(`analysis/${entry}: 文件名须为 ${a.courseId}.json`);
      }
      const course = coursesById.get(a.courseId);
      if (!course) {
        problems.push(`analysis/${entry}: 课程不存在: ${a.courseId}`);
        continue;
      }
      if (a.sourceIndex >= course.sources.length) {
        problems.push(`analysis/${entry}: sourceIndex 越界 (${a.sourceIndex})`);
      }
      const epNums = new Set(course.episodes.map((e) => e.n));
      const seen = new Set<number>();
      for (const ep of a.episodes) {
        if (!epNums.has(ep.n))
          problems.push(`analysis/${entry}: 集数不存在: ${ep.n}`);
        if (seen.has(ep.n))
          problems.push(`analysis/${entry}: 集数重复: ${ep.n}`);
        seen.add(ep.n);
      }
      analysisByCourse.set(a.courseId, a);
    }
  }

  // ---- 影子跟读单元 ----
  const shadowUnits: ShadowUnit[] = [];
  for (const file of listYamlFiles(path.join(root, "shadowing"))) {
    const parsed = ShadowUnitSchema.safeParse(readYaml(file));
    if (parsed.success) shadowUnits.push(parsed.data);
    else
      problems.push(
        `shadowing/${rel(file)}: ${parsed.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; ")}`,
      );
  }
  const shadowUnitsById = new Map<string, ShadowUnit>();
  for (const u of shadowUnits) {
    if (shadowUnitsById.has(u.id)) problems.push(`影子跟读单元 id 重复: ${u.id}`);
    shadowUnitsById.set(u.id, u);
  }

  if (problems.length > 0) throw new ContentError(problems);

  return {
    courses: courses.sort((a, b) => a.id.localeCompare(b.id)),
    coursesById,
    paths: paths.sort((a, b) => a.id.localeCompare(b.id)),
    pathsById,
    labTasksById,
    analysisByCourse,
    shadowUnits: shadowUnits.sort((a, b) => a.id.localeCompare(b.id)),
    shadowUnitsById,
  };
}

// 进程级单例缓存（dev HMR 下模块可能重复执行，用 globalThis 兜底）
const globalForContent = globalThis as unknown as {
  __guildContent?: ContentIndex;
};

export function getContent(): ContentIndex {
  if (!globalForContent.__guildContent) {
    globalForContent.__guildContent = loadContent();
  }
  return globalForContent.__guildContent;
}
