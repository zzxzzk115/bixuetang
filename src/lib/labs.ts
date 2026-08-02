import type { LabId } from "./content/schema";

/** 实验室注册表（代码侧路由与文案，任务清单在 content/labs/） */
export const LABS: Record<LabId, { href: string; icon: string; title: string; description: string }> = {
  hack: {
    href: "/lab/hack",
    icon: "🔩",
    title: "Hack 实验室",
    description: "在浏览器里从汇编到 Jack 语言造一台计算机（Nand2Tetris 移植）",
  },
  math: {
    href: "/lab/math",
    icon: "⚗️",
    title: "数学工坊",
    description: "公式演算、符号求导与函数图像",
  },
};
