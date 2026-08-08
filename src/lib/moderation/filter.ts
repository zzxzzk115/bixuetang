import { SENSITIVE_WORDS } from "./words";

// 敏感词过滤:命中就拒绝(不入库),配合友好提示。
// 归一化对付常见规避:去空白/分隔符、全角转半角、转小写,让「加 微 信」「Ｓｂ」都能挡。

// 保留中英日文与数字,其余(空格、标点、emoji、分隔符)一律剔除
function normalize(text: string): string {
  return (
    text
      // 全角 → 半角(ASCII 可见区)
      .replace(/[！-～]/g, (c) =>
        String.fromCharCode(c.charCodeAt(0) - 0xfee0),
      )
      .replace(/　/g, " ")
      .toLowerCase()
      // 只留字母数字与常见文字,插空/符号规避随之失效
      .replace(/[^0-9a-z一-鿿぀-ヿ가-힯]/g, "")
  );
}

const NORMALIZED_WORDS = SENSITIVE_WORDS.map(normalize).filter(Boolean);

/** 命中的第一个敏感词(归一化形态),没有则 null */
export function firstSensitiveHit(text: string): string | null {
  if (!text) return null;
  const norm = normalize(text);
  if (!norm) return null;
  for (const w of NORMALIZED_WORDS) {
    if (norm.includes(w)) return w;
  }
  return null;
}

export function containsSensitive(text: string): boolean {
  return firstSensitiveHit(text) !== null;
}
