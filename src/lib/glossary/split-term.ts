const CJK = /[一-龥぀-ヿ]/;
const ASCII_PREFIX = /\s([A-Za-z0-9][A-Za-z0-9+*#._-]{0,11})$/;

export function splitBilingualTerm(term: string): { en: string; zh: string } {
  const value = term.trim();
  const cjkIndex = value.search(CJK);
  if (cjkIndex <= 0) return { en: value, zh: "" };

  let en = value.slice(0, cjkIndex).trim();
  let zh = value.slice(cjkIndex).trim();
  const match = en.match(ASCII_PREFIX);
  if (!match) return { en, zh };

  const candidate = match[1];
  const englishPart = en.slice(0, match.index).trim();
  const tokens = englishPart.split(/\s+/);
  const firstToken = tokens[0] ?? "";
  // 中文侧已经带着同款 token(如「大 O 记号」自带 O)时,英文侧的
  // 尾词是术语本体的一部分(Big O),不能搬家——否则切成 Big | O 大 O 记号
  const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const zhHasCandidate = new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(zh);
  const repeated =
    !zhHasCandidate &&
    (tokens.includes(candidate) ||
      firstToken.startsWith(candidate) ||
      candidate.length === 1);

  if (repeated) {
    en = englishPart;
    zh = `${candidate} ${zh}`;
  }
  return { en, zh };
}
