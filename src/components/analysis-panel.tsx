"use client";

import Link from "next/link";
import { useState } from "react";
import type { CourseAnalysis, Episode } from "@/lib/content/schema";
import { seekTo } from "@/lib/seek";

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function RichText({
  text,
  html,
}: {
  text: string;
  html: Record<string, string>;
}) {
  const rendered = html[text];
  return rendered ? (
    <span
      className="analysis-rich-text"
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  ) : (
    text
  );
}

export function AnalysisPanel({
  analysis,
  episodes,
  formulaHtml,
  richTextHtml,
}: {
  analysis: CourseAnalysis;
  episodes: Episode[];
  /** 服务端用 KaTeX 预渲染好的公式：原始 LaTeX → HTML。渲染失败的不会进这张表 */
  formulaHtml: Record<string, string>;
  /** Escaped prose with server-rendered inline KaTeX fragments. */
  richTextHtml: Record<string, string>;
}) {
  const [openEp, setOpenEp] = useState<number | null>(null);
  const bvidOf = (n: number) => episodes.find((e) => e.n === n)?.bvid;

  return (
    <section className="hud-panel mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge px-4 py-3">
        <h2 className="combat-heading">知识点地图</h2>
        <span className="text-xs text-muted">
          AI 生成（{analysis.model}
          {analysis.basis === "titles-only"
            ? " · 基于集标题与公开资料，无时间轴"
            : " · 基于字幕逐集提炼"}
          ）· 内容以视频为准
        </span>
      </div>

      {analysis.overview && (
        <p className="border-b border-edge px-4 py-3 text-sm leading-relaxed text-muted">
          <RichText text={analysis.overview} html={richTextHtml} />
        </p>
      )}

      <ul className="divide-y divide-edge">
        {analysis.episodes.map((ep) => {
          const open = openEp === ep.n;
          const preview =
            ep.summary.length > 48
              ? ep.summary.slice(0, 48) + "…"
              : ep.summary;
          return (
            <li key={ep.n}>
              <button
                onClick={() => setOpenEp(open ? null : ep.n)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-panel-hover"
              >
                <span>
                  <span className="mr-2 text-muted">#{ep.n}</span>
                  <RichText text={preview} html={richTextHtml} />
                </span>
                <span className="shrink-0 text-muted">{open ? "▾" : "▸"}</span>
              </button>
              {open && (
                <div className="space-y-3 bg-background/40 px-4 py-3">
                  <p className="text-sm leading-relaxed">
                    <RichText text={ep.summary} html={richTextHtml} />
                  </p>
                  {ep.keyPoints.length > 0 && (
                    <ul className="space-y-1.5">
                      {ep.keyPoints.map((kp, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          {kp.t !== undefined ? (
                            <button
                              onClick={() =>
                                seekTo({
                                  page: ep.n,
                                  seconds: kp.t,
                                  bvid: bvidOf(ep.n),
                                })
                              }
                              className="shrink-0 rounded bg-edge px-1.5 py-0.5 font-mono text-xs text-gold hover:bg-gold hover:text-background"
                              title="跳转到该时间点"
                            >
                              ▶ {fmtTime(kp.t)}
                            </button>
                          ) : (
                            <span className="shrink-0 text-gold">◆</span>
                          )}
                          <span className="min-w-0">
                            <b>
                              <RichText text={kp.title} html={richTextHtml} />
                            </b>
                            {kp.detail && (
                              <span className="text-muted">
                                {" — "}
                                <RichText
                                  text={kp.detail}
                                  html={richTextHtml}
                                />
                              </span>
                            )}
                            {kp.formula && (
                              <span className="mt-1 flex items-center gap-2">
                                {/* 公式可能比容器宽，单独给一层横向滚动，别把整页撑出横条 */}
                                <span className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden py-0.5">
                                  {formulaHtml[kp.formula] ? (
                                    <span
                                      dangerouslySetInnerHTML={{
                                        __html: formulaHtml[kp.formula],
                                      }}
                                    />
                                  ) : (
                                    // KaTeX 认不出来时退回原始 LaTeX，总比什么都不显示强
                                    <code className="text-xs text-muted">
                                      {kp.formula}
                                    </code>
                                  )}
                                </span>
                                <Link
                                  href={`/lab/math?expr=${encodeURIComponent(kp.formula)}`}
                                  className="shrink-0 text-xs text-mana hover:underline"
                                  title="送入数学工坊"
                                >
                                  ⚗️
                                </Link>
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {ep.terms.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {ep.terms.map((t, i) => (
                        <span
                          key={i}
                          title={t.definition}
                          className="cursor-help rounded border border-edge bg-panel px-1.5 py-0.5 text-xs text-muted"
                        >
                          {t.term}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
