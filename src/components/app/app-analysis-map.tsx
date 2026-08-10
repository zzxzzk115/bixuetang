"use client";

import Link from "next/link";
import { Calculator, ChevronDown, Play, Sparkles } from "lucide-react";
import { useState } from "react";
import { fmtTime } from "@/lib/format/time";
import type { CourseAnalysis, Episode } from "@/lib/content/schema";
import { seekTo } from "@/lib/seek";

// 知识点地图（原生 App 版）：每集一张卡，展开后是「时间轴条目 + 术语 chip」。
// 时间戳做成可点的胶囊，点了播放器跳过去；公式卡右侧一键送数学工坊。

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
    <>{text}</>
  );
}

export function AppAnalysisMap({
  analysis,
  episodes,
  formulaHtml,
  richTextHtml,
}: {
  analysis: CourseAnalysis;
  episodes: Episode[];
  formulaHtml: Record<string, string>;
  richTextHtml: Record<string, string>;
}) {
  // 单集课程默认展开，多集默认收起（免得一屏全是内容）
  const [open, setOpen] = useState<number | null>(
    analysis.episodes.length === 1 ? analysis.episodes[0].n : null,
  );
  const episodeByNumber = new Map(episodes.map((e) => [e.n, e]));

  return (
    <div className="kmap">
      {analysis.overview && (
        <p className="kmap-overview">
          <Sparkles size={15} aria-hidden />
          <span>
            <RichText text={analysis.overview} html={richTextHtml} />
          </span>
        </p>
      )}

      <ol className="kmap-list">
        {analysis.episodes.map((ep) => {
          const isOpen = open === ep.n;
          const original = episodeByNumber.get(ep.n);
          const title = original?.title || `第 ${ep.n} 集`;
          return (
            <li key={ep.n} className={`kmap-card ${isOpen ? "open" : ""}`}>
              <button
                className="kmap-card-head"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : ep.n)}
              >
                <span className="kmap-no">{ep.n}</span>
                <span className="kmap-head-copy">
                  <b>{title}</b>
                  {!isOpen && (
                    <small>
                      <RichText text={ep.summary} html={richTextHtml} />
                    </small>
                  )}
                </span>
                <span className="kmap-meta">
                  {ep.keyPoints.length > 0 && (
                    <em>{ep.keyPoints.length} 个知识点</em>
                  )}
                  <ChevronDown size={17} aria-hidden />
                </span>
              </button>

              {isOpen && (
                <div className="kmap-body">
                  <p className="kmap-summary">
                    <RichText text={ep.summary} html={richTextHtml} />
                  </p>

                  {ep.keyPoints.length > 0 && (
                    <ol className="kmap-points">
                      {ep.keyPoints.map((kp, i) => (
                        <li key={i}>
                          {kp.t !== undefined ? (
                            <button
                              className="kmap-stamp"
                              onClick={() =>
                                seekTo({
                                  page: ep.n,
                                  seconds: kp.t,
                                  bvid: original?.bvid,
                                })
                              }
                              title="跳到该时间点"
                            >
                              <Play size={11} fill="currentColor" aria-hidden />
                              {fmtTime(kp.t)}
                            </button>
                          ) : (
                            <span className="kmap-dot">{i + 1}</span>
                          )}
                          <div className="kmap-point-copy">
                            <b>
                              <RichText text={kp.title} html={richTextHtml} />
                            </b>
                            {kp.detail && (
                              <p>
                                <RichText
                                  text={kp.detail}
                                  html={richTextHtml}
                                />
                              </p>
                            )}
                            {kp.formula && (
                              <div className="kmap-formula">
                                <div className="kmap-formula-body">
                                  {formulaHtml[kp.formula] ? (
                                    <span
                                      dangerouslySetInnerHTML={{
                                        __html: formulaHtml[kp.formula],
                                      }}
                                    />
                                  ) : (
                                    <code>{kp.formula}</code>
                                  )}
                                </div>
                                {/* 工坊要键盘，窄屏隐藏这个入口（CSS） */}
                                <Link
                                  href={`/lab/math?expr=${encodeURIComponent(kp.formula)}`}
                                  className="kmap-formula-action is-desktop-only"
                                  title="送入数学工坊"
                                  aria-label="送入数学工坊"
                                >
                                  <Calculator size={15} aria-hidden />
                                </Link>
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}

                  {ep.terms.length > 0 && (
                    <div className="kmap-terms">
                      {ep.terms.map((t, i) => (
                        <span key={i} title={t.definition}>
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
      </ol>

      <p className="kmap-foot">
        智能整理 · {analysis.model}
        {analysis.basis === "titles-only"
          ? " · 基于分集标题与公开资料，无时间轴"
          : " · 基于字幕逐集提炼"}
        · 以视频原内容为准
      </p>
    </div>
  );
}
