"use client";

import dynamic from "next/dynamic";
import { celebrate } from "@/lib/celebrate";
import { completeLabTask } from "@/lib/progress/actions";

// 实验室整体按路由分包且禁 SSR（WebGL/CodeMirror 均依赖浏览器环境）
const HackLab = dynamic(
  () => import("./hack-lab").then((m) => m.HackLab),
  {
    ssr: false,
    loading: () => (
      <p className="py-20 text-center text-sm text-muted">实验室加载中……</p>
    ),
  },
);

export function HackLabLoader() {
  const onQuest = (id: string) => {
    void completeLabTask("hack", id).then((res) => {
      if (res.ok && res.gained && res.gained > 0) {
        celebrate({
          kind: "quest",
          title: `成就达成：${res.taskTitle}`,
          subtitle: `+${res.gained} XP`,
        });
        if (res.levelUp) {
          celebrate({
            kind: "level",
            title: `升级！Lv.${res.newLevel}`,
            subtitle: "获得 1 技能点",
          });
        }
      }
    });
  };
  return <HackLab supportedKinds={["asm", "jack"]} onQuest={onQuest} />;
}
