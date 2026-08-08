import { SENSITIVE_WORDS } from "./words";

// 敏感词过滤:命中就拒绝(不入库),配合友好提示。
// 归一化对付常见规避:去空白/分隔符、全角转半角、转小写,让「加 微 信」「Ｓｂ」都能挡。
//
// 匹配用「输入子串 → 词表 Set 查表」,复杂度只跟输入长度有关,与词库大小无关——
// 词库有几万条也不慢(不逐词 includes 扫全库)。

// 保留中英日韩文与数字,其余(空格、标点、emoji、分隔符)一律剔除
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

const WORD_SET = new Set<string>();
let MIN_LEN = Infinity;
let MAX_LEN = 2;
for (const raw of SENSITIVE_WORDS) {
  const w = normalize(raw);
  if (w.length < 2) continue; // 单字过短,易误伤,一律不收
  WORD_SET.add(w);
  if (w.length < MIN_LEN) MIN_LEN = w.length;
  if (w.length > MAX_LEN) MAX_LEN = w.length;
}
if (MIN_LEN === Infinity) MIN_LEN = 2;
// 词库里若有超长条目,窗口封顶,避免长输入 × 超长窗口的浪费(超长词极罕见)
const WINDOW = Math.min(MAX_LEN, 32);

/** 命中的第一个敏感词(归一化形态),没有则 null */
export function firstSensitiveHit(text: string): string | null {
  if (!text) return null;
  const s = normalize(text);
  const n = s.length;
  for (let i = 0; i < n; i++) {
    const cap = Math.min(WINDOW, n - i);
    for (let len = MIN_LEN; len <= cap; len++) {
      const sub = s.slice(i, i + len);
      if (WORD_SET.has(sub)) return sub;
    }
  }
  return null;
}

export function containsSensitive(text: string): boolean {
  return firstSensitiveHit(text) !== null;
}
