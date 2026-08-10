import { SUBJECT_LABEL, type Subject } from "../content/schema";

// 学科的展示元数据单一出处:全名标签、短标签、配色。
// 全名标签 SUBJECT_LABEL 的权威定义在 content/schema.ts,这里转出 + 补短标签与配色,
// 免得各处再各写一份(历史上散落在 app-shell / onboarding / bag / route-map / shop … 近十处)。

export { SUBJECT_LABEL, type Subject };

/** 短标签:人工智能 → AI,其余同全名(用于空间紧张的胶囊/角标) */
export const SUBJECT_LABEL_SHORT: Record<Subject, string> = {
  ...SUBJECT_LABEL,
  ai: "AI",
};

/** 学科配色对应的 CSS 变量名(不含 var())。见 globals.css 的 --app-* */
export const SUBJECT_TONE_VAR: Record<Subject, string> = {
  cs: "--app-blue",
  math: "--app-teal",
  physics: "--app-orange",
  ai: "--app-green",
  en: "--app-pink",
  ja: "--app-purple",
  history: "--app-brown",
  research: "--app-gold",
  politics: "--app-red",
};

/** 学科色的 CSS 变量名(未知学科回退蓝色);要 var() 包裹用 subjectTone */
export function subjectToneVar(subject: string | undefined): string {
  return SUBJECT_TONE_VAR[subject as Subject] ?? "--app-blue";
}

/** 学科色,已用 var() 包好,可直接塞进 style */
export function subjectTone(subject: string | undefined): string {
  return `var(${subjectToneVar(subject)})`;
}
