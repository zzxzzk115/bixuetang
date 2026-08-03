import Link from "next/link";
import { getContent } from "@/lib/content/load";
import { renderMathText } from "@/lib/math/render-math-text";

export const metadata = { title: "术语卷宗" };

interface GlossaryEntry {
  term: string;
  definitions: string[];
  sources: { courseId: string; courseTitle: string; episodes: number[] }[];
}

function splitTerm(term: string): { en: string; zh: string } {
  const idx = term.search(/[一-龥぀-ヿ]/);
  if (idx <= 0) return { en: term.trim(), zh: "" };
  let en = term.slice(0, idx).trim();
  let zh = term.slice(idx).trim();
  const tail = en.match(/\s([A-Za-z0-9])$/);
  if (tail) {
    en = en.slice(0, -2).trim();
    zh = `${tail[1]} ${zh}`;
  }
  return { en, zh };
}

function buildGlossary(): GlossaryEntry[] {
  const content = getContent();
  const byKey = new Map<string, GlossaryEntry>();
  for (const [courseId, analysis] of content.analysisByCourse) {
    const courseTitle = content.coursesById.get(courseId)?.title ?? courseId;
    for (const episode of analysis.episodes) {
      for (const term of episode.terms) {
        const key = term.term.trim().toLowerCase();
        let entry = byKey.get(key);
        if (!entry) {
          entry = { term: term.term.trim(), definitions: [], sources: [] };
          byKey.set(key, entry);
        }
        if (!entry.definitions.includes(term.definition)) entry.definitions.push(term.definition);
        let source = entry.sources.find((item) => item.courseId === courseId);
        if (!source) {
          source = { courseId, courseTitle, episodes: [] };
          entry.sources.push(source);
        }
        if (!source.episodes.includes(episode.n)) source.episodes.push(episode.n);
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
}

export default async function GlossaryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const needle = q?.trim().toLowerCase();
  const all = buildGlossary();
  const entries = needle
    ? all.filter((entry) => entry.term.toLowerCase().includes(needle) || entry.definitions.some((definition) => definition.toLowerCase().includes(needle)))
    : all;
  const groups = new Map<string, GlossaryEntry[]>();
  for (const entry of entries) {
    const letter = /^[a-z]/i.test(entry.term) ? entry.term[0].toUpperCase() : "#";
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(entry);
  }

  return (
    <div className="page-stack mx-auto max-w-5xl">
      <header className="page-intro">
        <div>
          <p className="page-kicker">LEXICON ARCHIVE // 知识索引</p>
          <h1 className="page-title">术语卷宗</h1>
          <p className="page-lead">从课程知识点中聚合中英术语、数学表达与出现位置，建立跨副本的统一索引。</p>
        </div>
        <div className="hero-stat">
          <span className="hero-stat-value">{all.length}</span>
          <span className="hero-stat-label">条已收录术语</span>
        </div>
      </header>

      <form action="/glossary" method="get" className="filter-console">
        <label className="min-w-0 flex-1">
          <span className="page-kicker">ARCHIVE QUERY</span>
          <input name="q" defaultValue={q ?? ""} placeholder="输入英文、中文或定义关键词" className="mt-2 w-full border border-edge bg-background px-3 py-2 text-sm outline-none focus:border-gold" />
        </label>
        <button className="command-button secondary shrink-0" type="submit">检索卷宗</button>
      </form>

      {entries.length === 0 ? (
        <div className="hud-panel py-12 text-center text-sm text-muted">{all.length === 0 ? "术语卷宗尚未建立。" : "没有匹配的术语。"}</div>
      ) : (
        <div className="space-y-8">
          {[...groups.entries()].map(([letter, list]) => (
            <section key={letter}>
              <div className="section-heading">
                <div><p className="page-kicker">INDEX SECTOR</p><h2>{letter}</h2></div>
                <span className="font-mono text-xs text-muted">{list.length} ENTRIES</span>
              </div>
              <dl className="glossary-list">
                {list.map((entry) => {
                  const { en, zh } = splitTerm(entry.term);
                  return (
                    <div key={entry.term} className="glossary-entry">
                      <dt className="glossary-term">
                        <span className="glossary-en">{en}</span>
                        {zh && <span className="glossary-zh">{zh}</span>}
                      </dt>
                      <div className="glossary-body">
                        {entry.definitions.map((definition, index) => (
                          <dd key={index} className="analysis-rich-text text-sm text-muted" dangerouslySetInnerHTML={{ __html: renderMathText(definition) }} />
                        ))}
                        <dd className="mt-3 flex flex-wrap gap-1.5">
                          {entry.sources.map((source) => (
                            <Link key={source.courseId} href={`/courses/${source.courseId}`} className="archive-source">
                              {source.courseTitle} · 第 {source.episodes.join("/")} 集
                            </Link>
                          ))}
                        </dd>
                      </div>
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
