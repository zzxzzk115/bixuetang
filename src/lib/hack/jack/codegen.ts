// Jack 代码生成：AST + 符号表 → VM 命令
// 约定（与官方编译器一致）：
// - constructor: Memory.alloc(fieldCount) → pointer 0
// - method: this = argument 0，调用时对象引用作为第一个实参
// - 字符串常量: String.new + 逐字符 appendChar
// - 数组访问: 基址+下标 → pointer 1 / that 0

import type { VmCommand, Segment } from "../vm/parser";
import type { JackError } from "./tokenizer";
import type {
  CallExpr,
  ClassNode,
  Expr,
  Statement,
  Subroutine,
} from "./parser";

interface SymbolEntry {
  type: string;
  segment: Segment;
  index: number;
}

class Scope {
  private table = new Map<string, SymbolEntry>();
  private counts = new Map<Segment, number>();

  define(name: string, type: string, segment: Segment): void {
    const index = this.counts.get(segment) ?? 0;
    this.counts.set(segment, index + 1);
    this.table.set(name, { type, segment, index });
  }

  get(name: string): SymbolEntry | undefined {
    return this.table.get(name);
  }

  count(segment: Segment): number {
    return this.counts.get(segment) ?? 0;
  }

  has(name: string): boolean {
    return this.table.has(name);
  }
}

class Codegen {
  private out: VmCommand[] = [];
  private classScope = new Scope();
  private subScope = new Scope();
  private labelSeq = 0;
  private currentSub: Subroutine | null = null;

  constructor(
    private ast: ClassNode,
    private file: string,
  ) {}

  private fail(message: string, line: number): never {
    throw { file: this.file, line, message } satisfies JackError;
  }

  private emit(cmd: VmCommand): void {
    this.out.push(cmd);
  }

  private push(segment: Segment, index: number, line = 0): void {
    this.emit({ kind: "push", segment, index, line });
  }

  private pop(segment: Segment, index: number, line = 0): void {
    this.emit({ kind: "pop", segment, index, line });
  }

  private arith(op: "add" | "sub" | "neg" | "eq" | "gt" | "lt" | "and" | "or" | "not"): void {
    this.emit({ kind: "arith", op, line: 0 });
  }

  private call(name: string, args: number, line: number): void {
    this.emit({ kind: "call", name, args, line });
  }

  private label(l: string): void {
    this.emit({ kind: "label", label: l, line: 0 });
  }

  private goto(l: string): void {
    this.emit({ kind: "goto", label: l, line: 0 });
  }

  private ifGoto(l: string): void {
    this.emit({ kind: "if-goto", label: l, line: 0 });
  }

  private lookup(name: string): SymbolEntry | undefined {
    return this.subScope.get(name) ?? this.classScope.get(name);
  }

  generate(): VmCommand[] {
    for (const cv of this.ast.vars) {
      for (const name of cv.names) {
        this.classScope.define(name, cv.type, cv.scope === "static" ? "static" : "this");
      }
    }
    for (const sub of this.ast.subroutines) {
      this.genSubroutine(sub);
    }
    return this.out;
  }

  private genSubroutine(sub: Subroutine): void {
    this.currentSub = sub;
    this.subScope = new Scope();
    if (sub.kind === "method") {
      this.subScope.define("this", this.ast.name, "argument");
    }
    for (const p of sub.params) {
      this.subScope.define(p.name, p.type, "argument");
    }
    for (const lv of sub.locals) {
      for (const name of lv.names) {
        this.subScope.define(name, lv.type, "local");
      }
    }

    const nLocals = this.subScope.count("local");
    this.emit({
      kind: "function",
      name: `${this.ast.name}.${sub.name}`,
      locals: nLocals,
      line: sub.line,
    });

    if (sub.kind === "constructor") {
      const fields = this.classScope.count("this");
      this.push("constant", fields, sub.line);
      this.call("Memory.alloc", 1, sub.line);
      this.pop("pointer", 0, sub.line);
    } else if (sub.kind === "method") {
      this.push("argument", 0, sub.line);
      this.pop("pointer", 0, sub.line);
    }

    this.genStatements(sub.body);

    // 容错：函数体没有以 return 结束时补 return 0（官方编译器报错，这里宽松处理）
    const last = sub.body.at(-1);
    if (!last || last.kind !== "return") {
      this.push("constant", 0);
      this.emit({ kind: "return", line: sub.line });
    }
  }

  private genStatements(stmts: Statement[]): void {
    for (const s of stmts) this.genStatement(s);
  }

  private genStatement(s: Statement): void {
    switch (s.kind) {
      case "let": {
        const entry = this.lookup(s.name);
        if (!entry) this.fail(`未声明的变量: ${s.name}`, s.line);
        if (s.index) {
          // arr[i] = expr
          this.push(entry.segment, entry.index, s.line);
          this.genExpr(s.index);
          this.arith("add");
          this.genExpr(s.value);
          this.pop("temp", 0, s.line);
          this.pop("pointer", 1, s.line);
          this.push("temp", 0, s.line);
          this.pop("that", 0, s.line);
        } else {
          this.genExpr(s.value);
          this.pop(entry.segment, entry.index, s.line);
        }
        break;
      }
      case "if": {
        const els = `IF_ELSE_${this.labelSeq}`;
        const end = `IF_END_${this.labelSeq}`;
        this.labelSeq++;
        this.genExpr(s.cond);
        this.arith("not");
        this.ifGoto(els);
        this.genStatements(s.then);
        this.goto(end);
        this.label(els);
        if (s.else) this.genStatements(s.else);
        this.label(end);
        break;
      }
      case "while": {
        const top = `WHILE_TOP_${this.labelSeq}`;
        const end = `WHILE_END_${this.labelSeq}`;
        this.labelSeq++;
        this.label(top);
        this.genExpr(s.cond);
        this.arith("not");
        this.ifGoto(end);
        this.genStatements(s.body);
        this.goto(top);
        this.label(end);
        break;
      }
      case "do": {
        this.genCall(s.call);
        this.pop("temp", 0, s.line); // 丢弃返回值
        break;
      }
      case "return": {
        if (s.value) {
          this.genExpr(s.value);
        } else {
          this.push("constant", 0, s.line);
        }
        this.emit({ kind: "return", line: s.line });
        break;
      }
    }
  }

  private genExpr(e: Expr): void {
    switch (e.kind) {
      case "int":
        this.push("constant", e.value);
        break;
      case "string": {
        this.push("constant", e.value.length);
        this.call("String.new", 1, 0);
        for (const ch of e.value) {
          this.push("constant", ch.charCodeAt(0));
          this.call("String.appendChar", 2, 0);
        }
        break;
      }
      case "keyword": {
        if (e.value === "true") {
          this.push("constant", 0);
          this.arith("not"); // -1
        } else if (e.value === "false" || e.value === "null") {
          this.push("constant", 0);
        } else {
          // this
          this.push("pointer", 0);
        }
        break;
      }
      case "var": {
        const entry = this.lookup(e.name);
        if (!entry) this.fail(`未声明的变量: ${e.name}`, 0);
        this.push(entry.segment, entry.index);
        break;
      }
      case "index": {
        const entry = this.lookup(e.name);
        if (!entry) this.fail(`未声明的变量: ${e.name}`, 0);
        this.push(entry.segment, entry.index);
        this.genExpr(e.index);
        this.arith("add");
        this.pop("pointer", 1);
        this.push("that", 0);
        break;
      }
      case "unary": {
        this.genExpr(e.operand);
        this.arith(e.op === "-" ? "neg" : "not");
        break;
      }
      case "binary": {
        this.genExpr(e.left);
        this.genExpr(e.right);
        switch (e.op) {
          case "+": this.arith("add"); break;
          case "-": this.arith("sub"); break;
          case "&": this.arith("and"); break;
          case "|": this.arith("or"); break;
          case "<": this.arith("lt"); break;
          case ">": this.arith("gt"); break;
          case "=": this.arith("eq"); break;
          case "*": this.call("Math.multiply", 2, 0); break;
          case "/": this.call("Math.divide", 2, 0); break;
        }
        break;
      }
      case "call":
        this.genCall(e);
        break;
    }
  }

  private genCall(c: CallExpr): void {
    if (c.target === null) {
      // 本类方法调用：do draw() → this 作第一实参
      if (this.currentSub?.kind === "function") {
        this.fail(`function 中不能调用本类方法 ${c.method}（无 this）`, c.line);
      }
      this.push("pointer", 0, c.line);
      for (const a of c.args) this.genExpr(a);
      this.call(`${this.ast.name}.${c.method}`, c.args.length + 1, c.line);
      return;
    }
    const entry = this.lookup(c.target);
    if (entry) {
      // 对象方法调用：obj.method(...) → obj 作第一实参，目标类为变量类型
      this.push(entry.segment, entry.index, c.line);
      for (const a of c.args) this.genExpr(a);
      this.call(`${entry.type}.${c.method}`, c.args.length + 1, c.line);
    } else {
      // 类函数/构造器调用：Class.fn(...)
      for (const a of c.args) this.genExpr(a);
      this.call(`${c.target}.${c.method}`, c.args.length, c.line);
    }
  }
}

export function compileClass(
  ast: ClassNode,
  file: string,
): { ok: true; commands: VmCommand[] } | { ok: false; errors: JackError[] } {
  try {
    return { ok: true, commands: new Codegen(ast, file).generate() };
  } catch (e) {
    if (e && typeof e === "object" && "message" in e && "line" in e) {
      return { ok: false, errors: [e as JackError] };
    }
    throw e;
  }
}
