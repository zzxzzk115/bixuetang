"use client";

import Link from "next/link";
import {
  BookOpenText,
  Calculator,
  ChevronDown,
  Clock3,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { useState } from "react";
import type { CourseAnalysis, Episode } from "@/lib/content/schema";
import { seekTo } from "@/lib/seek";

function fmtTime(time: number): string {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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
  /** 服务端用 KaTeX 预渲染的公式：原始 LaTeX -> HTML。 */
  formulaHtml: Record<string, string>;
  /** 已转义正文以及服务端渲染的行内公式。 */
  richTextHtml: Record<string, string>;
}) {
  const [openEpisode, setOpenEpisode] = useState<number | null>(null);
  const episodeByNumber = new Map(
    episodes.map((episode) => [episode.n, episode]),
  );

  return (
    <section className="hud-panel analysis-map mt-6">
      <div className="analysis-map-head">
        <div>
          <span className="analysis-map-kicker">
            <Waypoints aria-hidden size={13} />
            COURSE KNOWLEDGE MAP
          </span>
          <h2 className="combat-heading">知识点地图</h2>
        </div>
        <span className="analysis-map-basis">
          <Sparkles aria-hidden size={13} />
          智能整理 · {analysis.model}
          {analysis.basis === "titles-only"
            ? " · 基于分集标题与公开资料，无时间轴"
            : " · 基于字幕逐集提炼"}
          · 以视频原内容为准
        </span>
      </div>

      {analysis.overview && (
        <div className="analysis-overview">
          <BookOpenText aria-hidden size={16} />
          <p>
            <RichText text={analysis.overview} html={richTextHtml} />
          </p>
        </div>
      )}

      <ol className="analysis-episode-list">
        {analysis.episodes.map((episodeAnalysis) => {
          const open = openEpisode === episodeAnalysis.n;
          const originalEpisode = episodeByNumber.get(episodeAnalysis.n);
          const originalTitle =
            originalEpisode?.title || `第 ${episodeAnalysis.n} 集`;

          return (
            <li key={episodeAnalysis.n} className={open ? "is-open" : ""}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() =>
                  setOpenEpisode(open ? null : episodeAnalysis.n)
                }
                className="analysis-episode-trigger"
              >
                <span className="analysis-episode-number">
                  EP.{String(episodeAnalysis.n).padStart(2, "0")}
                </span>
                <span className="analysis-episode-copy">
                  <strong>{originalTitle}</strong>
                  <span>
                    <RichText
                      text={episodeAnalysis.summary}
                      html={richTextHtml}
                    />
                  </span>
                </span>
                <ChevronDown
                  aria-hidden
                  size={17}
                  className="analysis-episode-chevron"
                />
              </button>

              {open && (
                <div className="analysis-episode-body">
                  <section className="analysis-summary-block">
                    <span className="analysis-section-label">本集概要</span>
                    <p>
                      <RichText
                        text={episodeAnalysis.summary}
                        html={richTextHtml}
                      />
                    </p>
                  </section>

                  {episodeAnalysis.keyPoints.length > 0 && (
                    <section>
                      <span className="analysis-section-label">
                        时间轴与知识重点
                      </span>
                      <ol className="analysis-keypoint-list">
                        {episodeAnalysis.keyPoints.map((keyPoint, index) => (
                          <li key={index}>
                            {keyPoint.t !== undefined ? (
                              <button
                                type="button"
                                onClick={() =>
                                  seekTo({
                                    page: episodeAnalysis.n,
                                    seconds: keyPoint.t,
                                    bvid: originalEpisode?.bvid,
                                  })
                                }
                                className="analysis-timestamp"
                                title="跳转到该时间点"
                              >
                                <Clock3 aria-hidden size={12} />
                                {fmtTime(keyPoint.t)}
                              </button>
                            ) : (
                              <span className="analysis-keypoint-index">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                            )}

                            <div className="analysis-keypoint-copy">
                              <strong>
                                <RichText
                                  text={keyPoint.title}
                                  html={richTextHtml}
                                />
                              </strong>
                              {keyPoint.detail && (
                                <p>
                                  <RichText
                                    text={keyPoint.detail}
                                    html={richTextHtml}
                                  />
                                </p>
                              )}
                              {keyPoint.formula && (
                                <div className="analysis-formula-row">
                                  <div className="analysis-formula">
                                    {formulaHtml[keyPoint.formula] ? (
                                      <span
                                        dangerouslySetInnerHTML={{
                                          __html:
                                            formulaHtml[keyPoint.formula],
                                        }}
                                      />
                                    ) : (
                                      <code>{keyPoint.formula}</code>
                                    )}
                                  </div>
                                  <Link
                                    href={`/lab/math?expr=${encodeURIComponent(
                                      keyPoint.formula,
                                    )}`}
                                    className="analysis-formula-action"
                                    title="送入数学工坊"
                                    aria-label="送入数学工坊"
                                  >
                                    <Calculator aria-hidden size={14} />
                                  </Link>
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}

                  {episodeAnalysis.terms.length > 0 && (
                    <section>
                      <span className="analysis-section-label">本集术语</span>
                      <div className="analysis-term-list">
                        {episodeAnalysis.terms.map((term, index) => (
                          <span key={index} title={term.definition}>
                            {term.term}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
