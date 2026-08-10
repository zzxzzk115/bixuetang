// 导出格式化(纯函数,不碰 DB):把「导出包」渲染成 Obsidian 友好的 Markdown、
// Anki 可导入的 TSV、以及给 API 用的 JSON。数据采集在 gather.ts(server)。

import { makeZip, type ZipEntry } from "./zip";

export interface ExportNote {
  courseId: string;
  courseTitle: string;
  episodeN: number;
  episodeTitle: string;
  tSec: number;
  /** 跳回视频那一秒的深链;拿不到 bvid(如纯 YouTube 源)时为 null */
  deepLink: string | null;
  contentMd: string;
  updatedAt: number;
}

export interface ExportTerm {
  courseId: string;
  courseTitle: string;
  episodeN: number;
  term: string;
  definition: string;
}

export interface ExportBundle {
  userName: string;
  /** 导出时间(ms);由 server 传入,纯函数不取当前时间 */
  generatedAt: number;
  dateStr: string; // YYYY-MM-DD
  notes: ExportNote[];
  terms: ExportTerm[];
}

/** 秒 → mm:ss 或 h:mm:ss */
export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

/** 去掉可能破坏 YAML/文件名的字符 */
function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

function courseGroups(bundle: ExportBundle): Map<string, ExportNote[]> {
  const byCourse = new Map<string, ExportNote[]>();
  for (const n of bundle.notes) {
    const arr = byCourse.get(n.courseId) ?? [];
    arr.push(n);
    byCourse.set(n.courseId, arr);
  }
  return byCourse;
}

/** 一门课的笔记 → 一份 Markdown(front-matter + 按集分组 + 时间戳深链 + 术语 wikilink) */
export function courseMarkdown(
  courseId: string,
  notes: ExportNote[],
  terms: ExportTerm[],
  dateStr: string,
): string {
  const title = notes[0]?.courseTitle ?? courseId;
  const lines: string[] = [];
  lines.push("---");
  lines.push(`course: ${title}`);
  lines.push(`courseId: ${courseId}`);
  lines.push("source: 必学堂 bixuetang.com");
  lines.push(`exported: ${dateStr}`);
  lines.push("tags: [必学堂, 笔记]");
  lines.push("---");
  lines.push("");
  lines.push(`# ${title}`);
  lines.push("");

  const sorted = [...notes].sort((a, b) => a.episodeN - b.episodeN || a.tSec - b.tSec);
  let curEp = -1;
  for (const n of sorted) {
    if (n.episodeN !== curEp) {
      curEp = n.episodeN;
      lines.push(`## 第 ${n.episodeN} 集 · ${n.episodeTitle}`);
      lines.push("");
    }
    const stamp = fmtTime(n.tSec);
    const head = n.deepLink ? `[${stamp}](${n.deepLink})` : stamp;
    // 笔记正文可能多行:首行接时间戳,其余行缩进为引用块,保持 Markdown 结构
    const body = n.contentMd.trim();
    const [first, ...rest] = body.split("\n");
    lines.push(`- **${head}** ${first}`);
    for (const r of rest) lines.push(`  ${r}`);
    lines.push("");
  }

  const courseTerms = terms.filter((t) => t.courseId === courseId);
  if (courseTerms.length) {
    lines.push("## 术语 · 卷宗");
    lines.push("");
    const seen = new Set<string>();
    for (const t of courseTerms) {
      if (seen.has(t.term)) continue;
      seen.add(t.term);
      lines.push(`- [[${t.term}]] — ${t.definition}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** 整个导出包 → zip 条目(每门课一个 .md,放「必学堂笔记/」目录) */
export function bundleToZipEntries(bundle: ExportBundle): ZipEntry[] {
  const byCourse = courseGroups(bundle);
  const entries: ZipEntry[] = [];
  for (const [courseId, notes] of byCourse) {
    const title = notes[0]?.courseTitle ?? courseId;
    entries.push({
      name: `必学堂笔记/${safeFileName(title)}.md`,
      content: courseMarkdown(courseId, notes, bundle.terms, bundle.dateStr),
    });
  }
  // 附一个索引页,Obsidian 里当入口
  const index = [
    "---",
    "tags: [必学堂]",
    "---",
    "",
    "# 必学堂 · 我的笔记",
    "",
    `导出于 ${bundle.dateStr} · 共 ${byCourse.size} 门课、${bundle.notes.length} 条笔记`,
    "",
    ...[...byCourse.entries()].map(([, notes]) => {
      const title = notes[0]?.courseTitle ?? "";
      return `- [[${safeFileName(title)}]]（${notes.length} 条）`;
    }),
    "",
  ].join("\n");
  entries.unshift({ name: "必学堂笔记/README.md", content: index });
  return entries;
}

/** 整个导出包 → 单个合并 Markdown(每门课一个 H1) */
export function bundleToSingleMarkdown(bundle: ExportBundle): string {
  const byCourse = courseGroups(bundle);
  const parts: string[] = [
    `# 必学堂 · 我的笔记`,
    `导出于 ${bundle.dateStr} · 共 ${byCourse.size} 门课、${bundle.notes.length} 条笔记`,
    "",
  ];
  for (const [courseId, notes] of byCourse) {
    parts.push(courseMarkdown(courseId, notes, bundle.terms, bundle.dateStr));
    parts.push("\n---\n");
  }
  return parts.join("\n");
}

/** 打包成 zip 字节流 */
export function bundleToZip(bundle: ExportBundle): Uint8Array {
  return makeZip(bundleToZipEntries(bundle));
}

function tsvCell(s: string): string {
  // Anki TSV:字段内的制表/换行会截断,统一转义;HTML <br> 让 Anki 保留换行
  return s.replace(/\r?\n/g, "<br>").replace(/\t/g, " ").trim();
}

/** 卷宗术语 → Anki 可导入 TSV(正面=术语,背面=释义,第三列 tag=课程) */
export function termsToAnkiTsv(terms: ExportTerm[]): string {
  const seen = new Set<string>();
  const rows: string[] = [
    "#separator:tab",
    "#html:true",
    "#tags column:3",
  ];
  for (const t of terms) {
    const key = `${t.courseId}::${t.term}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const tag = tsvCell(t.courseTitle).replace(/\s+/g, "_");
    rows.push([tsvCell(t.term), tsvCell(t.definition), tag].join("\t"));
  }
  return rows.join("\n");
}

/** 导出包 → JSON(给个人 API / 通用消费) */
export function bundleToJson(bundle: ExportBundle) {
  return {
    source: "bixuetang",
    user: bundle.userName,
    generatedAt: bundle.generatedAt,
    counts: { notes: bundle.notes.length, terms: bundle.terms.length },
    notes: bundle.notes.map((n) => ({
      courseId: n.courseId,
      courseTitle: n.courseTitle,
      episode: n.episodeN,
      episodeTitle: n.episodeTitle,
      tSec: n.tSec,
      timestamp: fmtTime(n.tSec),
      deepLink: n.deepLink,
      contentMd: n.contentMd,
      updatedAt: n.updatedAt,
    })),
    terms: bundle.terms.map((t) => ({
      courseId: t.courseId,
      courseTitle: t.courseTitle,
      episode: t.episodeN,
      term: t.term,
      definition: t.definition,
    })),
  };
}
