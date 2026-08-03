import Link from "next/link";
import { getContent } from "@/lib/content/load";
import { renderMathText } from "@/lib/math/render-math-text";

export const metadata = { title: "术语对照表" };

interface GlossaryEntry {
  term: string;
  definitions: string[];
  sources: { courseId: string; courseTitle: string; episodes: number[] }[];
}

/**
 * 术语按「english 中文」的约定录入，展示时拆开——
 * 否则「A* Algorithm A 星算法」连成一片读不出边界。
 * 从第一个中日韩字符处切分；没有中文就整条当英文。
 */
function splitTerm(term: string): { en: string; zh: string } {
  const idx = term.search(/[一-龥぀-ヿ]/);
  if (idx <= 0) return { en: term.trim(), zh: "" };
  let en = term.slice(0, idx).trim();
  let zh = term.slice(idx).trim();
  // 「A* Algorithm A 星算法」——中文名开头的单字母会被切到英文侧，还给中文
  const tail = en.match(/\s([A-Za-z0-9])$/);
  if (tail) {
    en = en.slice(0, -2).trim();
    zh = `${tail[1]} ${zh}`;
  }
  return { en, zh };
}

/** 聚合全站 AI 分析里的术语（同名合并、按字母排序） */
function buildGlossary(): GlossaryEntry[] {
  const content = getContent();
  const byKey = new Map<string, GlossaryEntry>();

  for (const [courseId, analysis] of content.analysisByCourse) {
    const courseTitle = content.coursesById.get(courseId)?.title ?? courseId;
    for (const ep of analysis.episodes) {
      for (const t of ep.terms) {
        const key = t.term.trim().toLowerCase();
        let entry = byKey.get(key);
        if (!entry) {
          entry = { term: t.term.trim(), definitions: [], sources: [] };
          byKey.set(key, entry);
        }
        if (!entry.definitions.includes(t.definition)) {
          entry.definitions.push(t.definition);
        }
        let src = entry.sources.find((s) => s.courseId === courseId);
        if (!src) {
          src = { courseId, courseTitle, episodes: [] };
          entry.sources.push(src);
        }
        if (!src.episodes.includes(ep.n)) src.episodes.push(ep.n);
      }
    }
  }

  return [...byKey.values()].sort((a, b) =>
    a.term.localeCompare(b.term, "en", { sensitivity: "base" }),
  );
}

export default async function GlossaryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const needle = q?.trim().toLowerCase();
  const all = buildGlossary();
  const entries = needle
    ? all.filter(
        (e) =>
          e.term.toLowerCase().includes(needle) ||
          e.definitions.some((d) => d.toLowerCase().includes(needle)),
      )
    : all;

  // 按首字母分组
  const groups = new Map<string, GlossaryEntry[]>();
  for (const e of entries) {
    const letter = /^[a-z]/i.test(e.term) ? e.term[0].toUpperCase() : "#";
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(e);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">📚 术语对照表</h1>
      <p className="mt-1 text-sm text-muted">
        由 AI 课程分析自动聚合的中英术语（共 {all.length} 条）。
        点击来源可跳回对应课程复习。
      </p>

      <form action="/glossary" method="get" className="mt-4 flex max-w-md gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="搜索术语或释义……"
          className="w-full rounded border border-edge bg-panel px-3 py-1.5 text-sm outline-none focus:border-gold"
        />
        <button className="shrink-0 rounded border border-edge px-3 py-1.5 text-sm text-muted hover:border-gold hover:text-gold">
          🔍
        </button>
      </form>

      {entries.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted">
          {all.length === 0
            ? "还没有术语——用 /analyze-course 技能给课程生成 AI 分析后，这里会自动聚合"
            : "没有匹配的术语"}
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {[...groups.entries()].map(([letter, list]) => (
            <section key={letter}>
              <h2 className="mb-2 border-b border-edge pb-1 text-sm font-bold text-gold">
                {letter}
              </h2>
              <dl className="space-y-3">
                {list.map((e) => {
                  const { en, zh } = splitTerm(e.term);
                  return (
                  <div key={e.term} className="rounded-lg border border-edge bg-panel p-3">
                    <dt className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="font-mono text-[15px] font-bold text-gold">
                        {en}
                      </span>
                      {zh && (
                        <span className="rounded border border-edge bg-panel-hover px-1.5 py-0.5 text-[13px] font-bold">
                          {zh}
                        </span>
                      )}
                    </dt>
                    {e.definitions.map((d, i) => (
                      <dd
                        key={i}
                        className="analysis-rich-text mt-1 text-sm text-muted"
                        dangerouslySetInnerHTML={{ __html: renderMathText(d) }}
                      />
                    ))}
                    <dd className="mt-1.5 flex flex-wrap gap-1.5">
                      {e.sources.map((s) => (
                        <Link
                          key={s.courseId}
                          href={`/courses/${s.courseId}`}
                          className="rounded border border-edge bg-panel-hover px-1.5 py-0.5 text-xs text-muted hover:border-gold hover:text-gold"
                        >
                          {s.courseTitle} · 第 {s.episodes.join("/")} 集
                        </Link>
                      ))}
                    </dd>
                  </div>
                  );
                })}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
