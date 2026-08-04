import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { GlossaryIndex } from "@/components/glossary-index";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { splitBilingualTerm } from "@/lib/glossary/split-term";
import { renderMathText } from "@/lib/math/render-math-text";

export const metadata = { title: "术语卷宗" };

interface GlossaryEntry {
  term: string;
  definitions: string[];
  sources: { courseId: string; courseTitle: string; episodes: number[] }[];
}

const LATIN_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const INDEX_ORDER = ["0-9", ...LATIN_KEYS, "中", "#"];

function groupKey(term: string): string {
  const first = term.trim()[0] ?? "";
  if (/[0-9]/.test(first)) return "0-9";
  if (/[a-z]/i.test(first)) return first.toUpperCase();
  if (/[㐀-鿿぀-ヿ]/.test(first)) return "中";
  return "#";
}

function groupId(key: string): string {
  if (key === "0-9") return "glossary-numeric";
  if (key === "中") return "glossary-cjk";
  if (key === "#") return "glossary-symbols";
  return `glossary-${key.toLowerCase()}`;
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
        if (!entry.definitions.includes(term.definition)) {
          entry.definitions.push(term.definition);
        }
        let source = entry.sources.find((item) => item.courseId === courseId);
        if (!source) {
          source = { courseId, courseTitle, episodes: [] };
          entry.sources.push(source);
        }
        if (!source.episodes.includes(episode.n)) {
          source.episodes.push(episode.n);
        }
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
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bootstrap = getGameBootstrap(user);

  const { q } = await searchParams;
  const needle = q?.trim().toLowerCase();
  const all = buildGlossary();
  const entries = needle
    ? all.filter(
        (entry) =>
          entry.term.toLowerCase().includes(needle) ||
          entry.definitions.some((definition) =>
            definition.toLowerCase().includes(needle),
          ),
      )
    : all;
  const groups = new Map<string, GlossaryEntry[]>();
  for (const entry of entries) {
    const key = groupKey(entry.term);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }
  const orderedGroups = INDEX_ORDER
    .filter((key) => groups.has(key))
    .map((key) => [key, groups.get(key)!] as const);
  const indexItems = orderedGroups.map(([key, list]) => ({
    key,
    id: groupId(key),
    count: list.length,
  }));

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page lex-root">
        <header className="lex-head">
          <h1>术语卷宗</h1>
          <span className="lex-count">{all.length} 条</span>
        </header>
        <p className="lex-lead">
          从课程知识点聚合的中英术语索引，点出处直达课程。
        </p>

        <form action="/glossary" method="get" className="lex-search">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="搜索英文、中文或定义关键词"
          />
          <button className="app-btn-primary" type="submit">
            搜索
          </button>
        </form>

        {entries.length === 0 ? (
          <div className="lex-empty">
            {all.length === 0 ? "术语卷宗尚未建立。" : "没有匹配的术语。"}
          </div>
        ) : (
          <>
            <div className="app-skin">
              <GlossaryIndex items={indexItems} />
            </div>
            <div className="lex-sectors">
              {orderedGroups.map(([key, list]) => (
                <section key={key} id={groupId(key)} className="lex-sector">
                  <div className="lex-sector-head">
                    <b>{key}</b>
                    <small>{list.length} 条</small>
                  </div>
                  <dl className="lex-list">
                    {list.map((entry) => {
                      const { en, zh } = splitBilingualTerm(entry.term);
                      return (
                        <div key={entry.term} className="lex-entry">
                          <dt>
                            <b>{en}</b>
                            {zh && <span>{zh}</span>}
                          </dt>
                          <div className="lex-entry-body app-skin">
                            {entry.definitions.map((definition, index) => (
                              <dd
                                key={index}
                                className="analysis-rich-text"
                                dangerouslySetInnerHTML={{
                                  __html: renderMathText(definition),
                                }}
                              />
                            ))}
                            <dd className="lex-sources">
                              {entry.sources.map((source) => (
                                <Link
                                  key={source.courseId}
                                  href={`/courses/${source.courseId}`}
                                >
                                  {source.courseTitle} · 第{" "}
                                  {source.episodes.join("/")} 集
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
          </>
        )}
      </div>
    </AppShell>
  );
}
