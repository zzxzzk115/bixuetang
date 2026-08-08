"use client";

import { useState, useTransition } from "react";
import { Check, Flag, Loader2 } from "lucide-react";
import {
  reportVideoIssue,
  type VideoReportKind,
} from "@/lib/game/report-actions";

// 「视频不见了」反馈按钮。播放失败(主源+备源都挂)时最显眼,
// 也可平时反馈内容不对。落一行给运营换搬运,一次点击零表单。

const KINDS: { kind: VideoReportKind; label: string }[] = [
  { kind: "gone", label: "打不开 / 被下架" },
  { kind: "wrong", label: "内容不对" },
  { kind: "other", label: "其他问题" },
];

export function VideoReportButton({
  courseId,
  episodeN,
  bvid,
  variant = "plain",
}: {
  courseId: string;
  episodeN: number;
  bvid: string;
  variant?: "plain" | "subtle";
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(kind: VideoReportKind) {
    startTransition(async () => {
      const r = await reportVideoIssue({ courseId, episodeN, bvid, kind });
      if (r.ok) {
        setDone(true);
        setOpen(false);
      }
    });
  }

  if (done) {
    return (
      <span className="video-report-done">
        <Check size={15} aria-hidden /> 已收到反馈，我们会尽快换源
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className={
          variant === "subtle" ? "video-report-subtle" : "app-btn-plain"
        }
        onClick={() => setOpen(true)}
      >
        <Flag size={15} aria-hidden /> 视频不见了？反馈
      </button>
    );
  }

  return (
    <div className="video-report-menu" role="group" aria-label="反馈视频问题">
      {KINDS.map((k) => (
        <button
          key={k.kind}
          type="button"
          className="app-btn-plain"
          disabled={pending}
          onClick={() => submit(k.kind)}
        >
          {pending ? (
            <Loader2 size={14} className="spin" aria-hidden />
          ) : null}
          {k.label}
        </button>
      ))}
      <button
        type="button"
        className="video-report-cancel"
        onClick={() => setOpen(false)}
        disabled={pending}
      >
        取消
      </button>
    </div>
  );
}
