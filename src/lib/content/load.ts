import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  CourseSchema,
  JobsSchema,
  PathSchema,
  SkillTreeSchema,
  type Course,
  type Job,
  type LearningPath,
  type SkillNode,
} from "./schema";

export interface ContentIndex {
  courses: Course[];
  coursesById: Map<string, Course>;
  paths: LearningPath[];
  pathsById: Map<string, LearningPath>;
  skillNodes: SkillNode[];
  skillById: Map<string, SkillNode>;
  jobs: Job[];
  jobById: Map<string, Job>;
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

  // ---- 技能树 ----
  let skillNodes: SkillNode[] = [];
  const treeFile = path.join(root, "skill-tree.yaml");
  if (fs.existsSync(treeFile)) {
    const parsed = SkillTreeSchema.safeParse(readYaml(treeFile));
    if (parsed.success) skillNodes = parsed.data.nodes;
    else
      problems.push(
        `skill-tree.yaml: ${parsed.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; ")}`,
      );
  }
  const skillById = new Map<string, SkillNode>();
  for (const n of skillNodes) {
    if (skillById.has(n.id)) problems.push(`技能节点 id 重复: ${n.id}`);
    skillById.set(n.id, n);
  }
  for (const n of skillNodes) {
    for (const r of n.requires) {
      if (!skillById.has(r))
        problems.push(`技能节点 ${n.id} 的前置节点不存在: ${r}`);
    }
    for (const cid of n.courses) {
      if (!coursesById.has(cid))
        problems.push(`技能节点 ${n.id} 引用了不存在的课程: ${cid}`);
    }
  }
  // DAG 环检测（三色 DFS）
  {
    const color = new Map<string, 0 | 1 | 2>();
    const visit = (id: string, trail: string[]): void => {
      const c = color.get(id) ?? 0;
      if (c === 1) {
        problems.push(`技能树存在环: ${[...trail, id].join(" → ")}`);
        return;
      }
      if (c === 2) return;
      color.set(id, 1);
      for (const r of skillById.get(id)?.requires ?? []) {
        if (skillById.has(r)) visit(r, [...trail, id]);
      }
      color.set(id, 2);
    };
    for (const n of skillNodes) visit(n.id, []);
  }

  // ---- 职业 ----
  let jobs: Job[] = [];
  const jobsFile = path.join(root, "jobs.yaml");
  if (fs.existsSync(jobsFile)) {
    const parsed = JobsSchema.safeParse(readYaml(jobsFile));
    if (parsed.success) jobs = parsed.data.jobs;
    else
      problems.push(
        `jobs.yaml: ${parsed.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; ")}`,
      );
  }
  const jobById = new Map<string, Job>();
  for (const j of jobs) {
    if (jobById.has(j.id)) problems.push(`职业 id 重复: ${j.id}`);
    jobById.set(j.id, j);
  }
  for (const j of jobs) {
    for (const p of j.parents) {
      if (!jobById.has(p)) problems.push(`职业 ${j.id} 的 parent 不存在: ${p}`);
    }
    const s = j.requires.skills;
    for (const id of [...(s?.allOf ?? []), ...(s?.anyOf ?? [])]) {
      if (!skillById.has(id))
        problems.push(`职业 ${j.id} 引用了不存在的技能节点: ${id}`);
    }
  }

  if (problems.length > 0) throw new ContentError(problems);

  return {
    courses: courses.sort((a, b) => a.id.localeCompare(b.id)),
    coursesById,
    paths: paths.sort((a, b) => a.id.localeCompare(b.id)),
    pathsById,
    skillNodes,
    skillById,
    jobs,
    jobById,
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
