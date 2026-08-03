"use client";

import { Pause, Play, RotateCcw, Save, ScrollText, TimerReset } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { celebrate } from "@/lib/celebrate";
import type { Episode } from "@/lib/content/schema";
import { completeLearningSession } from "@/lib/game/learning-actions";
import { SEEK_EVENT, type SeekRequest } from "@/lib/seek";

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function LearningSessionPanel({
  courseId,
  episodes,
  initialEpisode,
  loggedIn,
}: {
  courseId: string;
  episodes: Episode[];
  initialEpisode: number;
  loggedIn: boolean;
}) {
  const [episodeN, setEpisodeN] = useState(initialEpisode);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const episode = useMemo(
    () => episodes.find((item) => item.n === episodeN) ?? episodes[0],
    [episodeN, episodes],
  );

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    const onSeek = (event: Event) => {
      const request = (event as CustomEvent<SeekRequest>).detail;
      if (request.page) setEpisodeN(request.page);
    };
    window.addEventListener(SEEK_EVENT, onSeek);
    return () => window.removeEventListener(SEEK_EVENT, onSeek);
  }, []);

  const submit = () => {
    if (!loggedIn) {
      setMessage("登录后可记录学习证据与领取奖励");
      return;
    }
    setRunning(false);
    setMessage(null);
    startTransition(async () => {
      const minutes = seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 0;
      const result = await completeLearningSession(courseId, episode.n, minutes, summary);
      if (!result.ok) {
        setMessage(result.error ?? "记录失败");
        return;
      }
      setMessage(`已记录 ${result.totalMinutes ?? minutes} 分钟专注`);
      if ((result.gained ?? 0) > 0) {
        celebrate({
          kind: "quest",
          title: "学习证据已归档",
          subtitle: `专注与复述奖励 +${result.gained} XP`,
        });
      }
      setSeconds(0);
      setSummary("");
      router.refresh();
    });
  };

  return (
    <section className="session-console">
      <div className="session-console-head">
        <span><TimerReset aria-hidden size={15} /> 远征计时器</span>
        <b>EP.{String(episode.n).padStart(2, "0")}</b>
      </div>
      <p className="session-episode">{episode.title}</p>
      <div className="session-clock">{formatClock(seconds)}</div>
      <div className="session-controls">
        <button onClick={() => setRunning((value) => !value)} className="session-primary">
          {running ? <Pause aria-hidden size={15} /> : <Play aria-hidden size={15} />}
          {running ? "暂停" : "开始专注"}
        </button>
        <button onClick={() => { setRunning(false); setSeconds(0); }} className="session-icon" title="重置计时">
          <RotateCcw aria-hidden size={15} />
        </button>
      </div>
      <label className="session-summary">
        <span><ScrollText aria-hidden size={14} /> 战后复述</span>
        <textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="用自己的话写下本集核心内容"
          rows={4}
        />
      </label>
      <button onClick={submit} disabled={pending} className="command-button w-full justify-center">
        <Save aria-hidden size={14} />
        {pending ? "归档中" : "结束并归档"}
      </button>
      {message && <p className="session-message">{message}</p>}
    </section>
  );
}
