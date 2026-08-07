"use client";

import { useEffect, useRef, useState } from "react";
import {
  REWARD_TOAST_EVENT,
  type RewardToast as RewardToastDetail,
} from "@/lib/reward-feedback";

// 全局奖励吐司层。挂在根 layout,任何页面结算都能弹——
// 之前每个组件各自维护一套本地吐司,播放器自动打卡那条主路径干脆没有。

interface Item extends RewardToastDetail {
  id: number;
}

const SHOW_MS = 2600;

export function RewardToastLayer() {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<RewardToastDetail>).detail;
      const id = ++seq.current;
      // 多条奖励错峰入场,别一屏糊脸
      const delay = (seq.current % 5) * 120;
      setTimeout(() => {
        setItems((cur) => [...cur, { ...detail, id }]);
        setTimeout(
          () => setItems((cur) => cur.filter((i) => i.id !== id)),
          SHOW_MS,
        );
      }, delay);
    };
    window.addEventListener(REWARD_TOAST_EVENT, onToast);
    return () => window.removeEventListener(REWARD_TOAST_EVENT, onToast);
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="reward-toasts" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`reward-toast tone-${item.tone ?? "xp"}`}>
          {item.text}
        </div>
      ))}
    </div>
  );
}
