// VM 语言解析：文本 → VmCommand[]

export type Segment =
  | "argument" | "local" | "static" | "constant"
  | "this" | "that" | "pointer" | "temp";

export type ArithOp =
  | "add" | "sub" | "neg" | "eq" | "gt" | "lt" | "and" | "or" | "not";

export type VmCommand =
  | { kind: "push" | "pop"; segment: Segment; index: number; line: number }
  | { kind: "arith"; op: ArithOp; line: number }
  | { kind: "label" | "goto" | "if-goto"; label: string; line: number }
  | { kind: "function"; name: string; locals: number; line: number }
  | { kind: "call"; name: string; args: number; line: number }
  | { kind: "return"; line: number };

export interface VmError {
  line: number;
  message: string;
}

const SEGMENTS: Segment[] = [
  "argument", "local", "static", "constant", "this", "that", "pointer", "temp",
];
const ARITH: ArithOp[] = ["add", "sub", "neg", "eq", "gt", "lt", "and", "or", "not"];
const LABEL_RE = /^[A-Za-z_.$:][A-Za-z0-9_.$:]*$/;

export function parseVm(
  source: string,
): { ok: true; commands: VmCommand[] } | { ok: false; errors: VmError[] } {
  const commands: VmCommand[] = [];
  const errors: VmError[] = [];

  source.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const text = raw.replace(/\/\/.*$/, "").trim();
    if (text === "") return;
    const parts = text.split(/\s+/);
    const [op, a, b] = parts;

    if (ARITH.includes(op as ArithOp) && parts.length === 1) {
      commands.push({ kind: "arith", op: op as ArithOp, line });
      return;
    }
    if (op === "push" || op === "pop") {
      const seg = a as Segment;
      const index = Number(b);
      if (!SEGMENTS.includes(seg)) {
        errors.push({ line, message: `非法段名: ${a}` });
      } else if (!Number.isInteger(index) || index < 0) {
        errors.push({ line, message: `非法下标: ${b}` });
      } else if (op === "pop" && seg === "constant") {
        errors.push({ line, message: "constant 段不能 pop" });
      } else {
        commands.push({ kind: op, segment: seg, index, line });
      }
      return;
    }
    if (op === "label" || op === "goto" || op === "if-goto") {
      if (!a || !LABEL_RE.test(a)) {
        errors.push({ line, message: `非法标签: ${a ?? ""}` });
      } else {
        commands.push({ kind: op, label: a, line });
      }
      return;
    }
    if (op === "function" || op === "call") {
      const n = Number(b);
      if (!a || !LABEL_RE.test(a)) {
        errors.push({ line, message: `非法函数名: ${a ?? ""}` });
      } else if (!Number.isInteger(n) || n < 0) {
        errors.push({ line, message: `非法数量: ${b}` });
      } else if (op === "function") {
        commands.push({ kind: "function", name: a, locals: n, line });
      } else {
        commands.push({ kind: "call", name: a, args: n, line });
      }
      return;
    }
    if (op === "return" && parts.length === 1) {
      commands.push({ kind: "return", line });
      return;
    }
    errors.push({ line, message: `无法识别的命令: ${text}` });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, commands };
}
