import type { LabId } from "./content/schema";

export interface LabDefinition {
  href: string;
  code: string;
  title: string;
  description: string;
}

export const LABS: Record<LabId, LabDefinition> = {
  hack: {
    href: "/lab/hack",
    code: "FAC-H01",
    title: "Hack 计算机工坊",
    description: "从汇编、CPU、VM 到 Jack，在浏览器里亲手构造一台完整计算机。",
  },
  math: {
    href: "/lab/math",
    code: "FAC-M02",
    title: "数学演算设施",
    description: "进行公式演算、符号求导、数值计算与函数图像实验。",
  },
};
