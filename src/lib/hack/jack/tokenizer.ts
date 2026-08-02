// Jack 词法分析

export type TokenType = "keyword" | "symbol" | "int" | "string" | "identifier";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
}

export interface JackError {
  file: string;
  line: number;
  message: string;
}

const KEYWORDS = new Set([
  "class", "constructor", "function", "method", "field", "static", "var",
  "int", "char", "boolean", "void", "true", "false", "null", "this",
  "let", "do", "if", "else", "while", "return",
]);

const SYMBOLS = new Set("{}()[].,;+-*/&|<>=~");

export function tokenize(
  source: string,
  file: string,
): { ok: true; tokens: Token[] } | { ok: false; errors: JackError[] } {
  const tokens: Token[] = [];
  const errors: JackError[] = [];
  let i = 0;
  let line = 1;
  const n = source.length;

  while (i < n) {
    const ch = source[i];

    if (ch === "\n") { line++; i++; continue; }
    if (/\s/.test(ch)) { i++; continue; }

    // 注释
    if (ch === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const start = line;
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") line++;
        i++;
      }
      if (i >= n) {
        errors.push({ file, line: start, message: "块注释未闭合" });
        break;
      }
      i += 2;
      continue;
    }

    if (SYMBOLS.has(ch)) {
      tokens.push({ type: "symbol", value: ch, line });
      i++;
      continue;
    }

    if (/\d/.test(ch)) {
      let j = i;
      while (j < n && /\d/.test(source[j])) j++;
      const value = source.slice(i, j);
      if (Number(value) > 32767) {
        errors.push({ file, line, message: `整数常量超界 (0–32767): ${value}` });
      }
      tokens.push({ type: "int", value, line });
      i = j;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      while (j < n && source[j] !== '"' && source[j] !== "\n") j++;
      if (source[j] !== '"') {
        errors.push({ file, line, message: "字符串常量未闭合" });
        i = j;
        continue;
      }
      tokens.push({ type: "string", value: source.slice(i + 1, j), line });
      i = j + 1;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(source[j])) j++;
      const value = source.slice(i, j);
      tokens.push({
        type: KEYWORDS.has(value) ? "keyword" : "identifier",
        value,
        line,
      });
      i = j;
      continue;
    }

    errors.push({ file, line, message: `非法字符: ${ch}` });
    i++;
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, tokens };
}
