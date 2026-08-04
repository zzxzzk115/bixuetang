import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { GlossaryIndex } from "@/components/glossary-index";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { allTermInputs } from "@/lib/game/glossary-source";
import { unlockedTerms, type TermRecord } from "@/lib/game/glossary-unlock";
import { getUserProgress } from "@/lib/progress/queries";
import { splitBilingualTerm } from "@/lib/glossary/split-term";
import { renderMathText } from "@/lib/math/render-math-text";

export const metadata = { title: "术语卷宗" };

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

export default async function GlossaryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bootstrap = getGameBootstrap(user);
  const progress = getUserProgress(user.id);

  const { q } = await searchParams;
  const needle = q?.trim().toLowerCase();
  // 术语跟着「看过的集」解锁：没接触过的知识点摆出释义也是模糊的，
  // 而且词条要能点回具体某一集，没看过的集列在出处里只会是死链
  const all = unlockedTerms(allTermInputs(), progress.watchedByCourse);
  const entries = needle
    ? all.filter(
        (entry) =>
          entry.term.toLowerCase().includes(needle) ||
          entry.definitions.some((definition) =>
            definition.toLowerCase().includes(needle),
          ),
      )
    : all;
  const groups = new Map<string, TermRecord[]>();
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
            <div className="lex-rail-slot">
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
