"use client";

import { useEffect, useRef } from "react";
import { celebrate } from "@/lib/celebrate";
import { fetchDailyQuests } from "@/lib/game/quest-actions";
import type { DailyQuestView } from "@/lib/game/quests";
import { QUESTS_CHANGED_EVENT } from "@/lib/quest-events";

// 每日任务完成特效。收到 QUESTS_CHANGED_EVENT 就拉最新任务,和上次
// 快照 diff:新跨到 complete 的任务弹「任务完成」庆祝(可批量,逐条弹)。
// 若此刻在全屏(原生全屏或播放器网页全屏),入队延后到退出全屏再弹——
// 全屏观看时不该被弹窗打断(与卷宗解锁同一套体验)。

// 复习任务由复习会话页自己的庆祝覆盖(语义一致),这里不重复弹;
// watcher 负责观看/试炼两类——它们的结算点没有专属完成庆祝
const KIND_TITLE: Record<string, string> = {
  watch: "今日学习任务达成",
  trial: "今日试炼任务达成",
};

function inFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  if (document.fullscreenElement) return true;
  // 播放器网页全屏不进 fullscreenElement,靠类名判断
  return !!document.querySelector(
    ".art-fullscreen, .art-fullscreen-web",
  );
}

export function QuestCompleteWatcher() {
  // 已弹过的任务 id(避免刷新重复弹);首帧用 null 表示还没建立基线
  const doneRef = useRef<Set<number> | null>(null);
  const deferredRef = useRef<DailyQuestView[]>([]);

  useEffect(() => {
    let cancelled = false;

    const flush = () => {
      const pending = deferredRef.current;
      if (pending.length === 0) return;
      deferredRef.current = [];
      pending.forEach((q, i) => {
        setTimeout(() => {
          celebrate({
            kind: "quest",
            title: KIND_TITLE[q.kind] ?? "任务完成",
            subtitle: `${q.title} · 去领 +${q.rewardXp} XP`,
          });
        }, i * 900);
      });
    };

    const check = async () => {
      const quests = await fetchDailyQuests();
      if (cancelled) return;
      const nowDone = quests.filter((q) => q.complete);
      // 首次:只建立基线,不补弹历史完成(避免进页面就炸一堆)
      if (doneRef.current === null) {
        doneRef.current = new Set(nowDone.map((q) => q.id));
        return;
      }
      // 新完成的都记入基线(防复看重复弹),但复习类不由本组件弹特效
      const freshAll = nowDone.filter((q) => !doneRef.current!.has(q.id));
      for (const q of freshAll) doneRef.current.add(q.id);
      const fresh = freshAll.filter((q) => q.kind in KIND_TITLE);
      if (fresh.length === 0) return;

      if (inFullscreen()) {
        deferredRef.current.push(...fresh);
      } else {
        fresh.forEach((q, i) => {
          setTimeout(() => {
            celebrate({
              kind: "quest",
              title: KIND_TITLE[q.kind] ?? "任务完成",
              subtitle: `${q.title} · 去领 +${q.rewardXp} XP`,
            });
          }, i * 900);
        });
      }
    };

    // 建立初始基线
    void check();

    const onChanged = () => void check();
    const onFsChange = () => {
      if (!inFullscreen()) flush();
    };
    window.addEventListener(QUESTS_CHANGED_EVENT, onChanged);
    document.addEventListener("fullscreenchange", onFsChange);
    // 播放器网页全屏靠类名,退出时它会移除类;用 MutationObserver 兜底
    const mo = new MutationObserver(() => {
      if (!inFullscreen()) flush();
    });
    mo.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["class"],
    });

    return () => {
      cancelled = true;
      window.removeEventListener(QUESTS_CHANGED_EVENT, onChanged);
      document.removeEventListener("fullscreenchange", onFsChange);
      mo.disconnect();
    };
  }, []);

  return null;
}
