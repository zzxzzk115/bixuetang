// Jack 语法分析：Token[] → AST（递归下降，完整 Jack 语法）

import type { JackError, Token } from "./tokenizer";

// ---------- AST ----------

export interface ClassNode {
  name: string;
  vars: ClassVar[];
  subroutines: Subroutine[];
}

export interface ClassVar {
  scope: "static" | "field";
  type: string;
  names: string[];
}

export interface Subroutine {
  kind: "constructor" | "function" | "method";
  returnType: string;
  name: string;
  params: { type: string; name: string }[];
  locals: { type: string; names: string[] }[];
  body: Statement[];
  line: number;
}

export type Statement =
  | { kind: "let"; name: string; index: Expr | null; value: Expr; line: number }
  | { kind: "if"; cond: Expr; then: Statement[]; else: Statement[] | null; line: number }
  | { kind: "while"; cond: Expr; body: Statement[]; line: number }
  | { kind: "do"; call: CallExpr; line: number }
  | { kind: "return"; value: Expr | null; line: number };

export type Expr =
  | { kind: "int"; value: number }
  | { kind: "string"; value: string }
  | { kind: "keyword"; value: "true" | "false" | "null" | "this" }
  | { kind: "var"; name: string }
  | { kind: "index"; name: string; index: Expr }
  | { kind: "unary"; op: "-" | "~"; operand: Expr }
  | { kind: "binary"; op: string; left: Expr; right: Expr }
  | CallExpr;

export interface CallExpr {
  kind: "call";
  /** 对象/类限定名（obj.method / Class.fn），无限定则为 null（本类方法） */
  target: string | null;
  method: string;
  args: Expr[];
  line: number;
}

const BINARY_OPS = new Set(["+", "-", "*", "/", "&", "|", "<", ">", "="]);

// ---------- Parser ----------

class Parser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private file: string,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private fail(message: string, line?: number): never {
    const t = this.peek();
    throw {
      file: this.file,
      line: line ?? t?.line ?? this.tokens.at(-1)?.line ?? 0,
      message,
    } satisfies JackError;
  }

  private next(): Token {
    const t = this.tokens[this.pos++];
    if (!t) this.fail("源码在此意外结束");
    return t;
  }

  private expect(value: string): Token {
    const t = this.next();
    if (t.value !== value) this.fail(`期望 '${value}'，得到 '${t.value}'`, t.line);
    return t;
  }

  private expectType(type: Token["type"], what: string): Token {
    const t = this.next();
    if (t.type !== type) this.fail(`期望${what}，得到 '${t.value}'`, t.line);
    return t;
  }

  private typeName(): string {
    const t = this.next();
    if (
      t.type === "identifier" ||
      (t.type === "keyword" && ["int", "char", "boolean"].includes(t.value))
    ) {
      return t.value;
    }
    this.fail(`期望类型名，得到 '${t.value}'`, t.line);
  }

  parseClass(): ClassNode {
    this.expect("class");
    const name = this.expectType("identifier", "类名").value;
    this.expect("{");
    const vars: ClassVar[] = [];
    while (this.peek()?.value === "static" || this.peek()?.value === "field") {
      const scope = this.next().value as "static" | "field";
      const type = this.typeName();
      const names = [this.expectType("identifier", "变量名").value];
      while (this.peek()?.value === ",") {
        this.next();
        names.push(this.expectType("identifier", "变量名").value);
      }
      this.expect(";");
      vars.push({ scope, type, names });
    }
    const subroutines: Subroutine[] = [];
    while (this.peek()?.value !== "}") {
      subroutines.push(this.parseSubroutine());
    }
    this.expect("}");
    if (this.peek()) this.fail("class 结束后存在多余内容");
    return { name, vars, subroutines };
  }

  private parseSubroutine(): Subroutine {
    const kindTok = this.next();
    if (!["constructor", "function", "method"].includes(kindTok.value)) {
      this.fail(`期望子程序声明，得到 '${kindTok.value}'`, kindTok.line);
    }
    const kind = kindTok.value as Subroutine["kind"];
    const returnType =
      this.peek()?.value === "void" ? this.next().value : this.typeName();
    const name = this.expectType("identifier", "子程序名").value;
    this.expect("(");
    const params: Subroutine["params"] = [];
    if (this.peek()?.value !== ")") {
      for (;;) {
        const type = this.typeName();
        const pname = this.expectType("identifier", "参数名").value;
        params.push({ type, name: pname });
        if (this.peek()?.value !== ",") break;
        this.next();
      }
    }
    this.expect(")");
    this.expect("{");
    const locals: Subroutine["locals"] = [];
    while (this.peek()?.value === "var") {
      this.next();
      const type = this.typeName();
      const names = [this.expectType("identifier", "变量名").value];
      while (this.peek()?.value === ",") {
        this.next();
        names.push(this.expectType("identifier", "变量名").value);
      }
      this.expect(";");
      locals.push({ type, names });
    }
    const body = this.parseStatements();
    this.expect("}");
    return { kind, returnType, name, params, locals, body, line: kindTok.line };
  }

  private parseStatements(): Statement[] {
    const out: Statement[] = [];
    for (;;) {
      const t = this.peek();
      if (!t || t.value === "}") return out;
      switch (t.value) {
        case "let": out.push(this.parseLet()); break;
        case "if": out.push(this.parseIf()); break;
        case "while": out.push(this.parseWhile()); break;
        case "do": out.push(this.parseDo()); break;
        case "return": out.push(this.parseReturn()); break;
        default:
          this.fail(`期望语句，得到 '${t.value}'`, t.line);
      }
    }
  }

  private parseLet(): Statement {
    const line = this.expect("let").line;
    const name = this.expectType("identifier", "变量名").value;
    let index: Expr | null = null;
    if (this.peek()?.value === "[") {
      this.next();
      index = this.parseExpr();
      this.expect("]");
    }
    this.expect("=");
    const value = this.parseExpr();
    this.expect(";");
    return { kind: "let", name, index, value, line };
  }

  private parseIf(): Statement {
    const line = this.expect("if").line;
    this.expect("(");
    const cond = this.parseExpr();
    this.expect(")");
    this.expect("{");
    const then = this.parseStatements();
    this.expect("}");
    let els: Statement[] | null = null;
    if (this.peek()?.value === "else") {
      this.next();
      this.expect("{");
      els = this.parseStatements();
      this.expect("}");
    }
    return { kind: "if", cond, then, else: els, line };
  }

  private parseWhile(): Statement {
    const line = this.expect("while").line;
    this.expect("(");
    const cond = this.parseExpr();
    this.expect(")");
    this.expect("{");
    const body = this.parseStatements();
    this.expect("}");
    return { kind: "while", cond, body, line };
  }

  private parseDo(): Statement {
    const line = this.expect("do").line;
    const first = this.expectType("identifier", "调用目标").value;
    const call = this.parseCallAfterIdentifier(first, line);
    this.expect(";");
    return { kind: "do", call, line };
  }

  private parseReturn(): Statement {
    const line = this.expect("return").line;
    let value: Expr | null = null;
    if (this.peek()?.value !== ";") value = this.parseExpr();
    this.expect(";");
    return { kind: "return", value, line };
  }

  private parseCallAfterIdentifier(first: string, line: number): CallExpr {
    if (this.peek()?.value === ".") {
      this.next();
      const method = this.expectType("identifier", "方法名").value;
      return { kind: "call", target: first, method, args: this.parseArgs(), line };
    }
    return { kind: "call", target: null, method: first, args: this.parseArgs(), line };
  }

  private parseArgs(): Expr[] {
    this.expect("(");
    const args: Expr[] = [];
    if (this.peek()?.value !== ")") {
      args.push(this.parseExpr());
      while (this.peek()?.value === ",") {
        this.next();
        args.push(this.parseExpr());
      }
    }
    this.expect(")");
    return args;
  }

  // Jack 无运算符优先级：term (op term)* 左结合
  private parseExpr(): Expr {
    let left = this.parseTerm();
    while (this.peek() && BINARY_OPS.has(this.peek()!.value)) {
      const op = this.next().value;
      const right = this.parseTerm();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }

  private parseTerm(): Expr {
    const t = this.next();
    if (t.type === "int") return { kind: "int", value: Number(t.value) };
    if (t.type === "string") return { kind: "string", value: t.value };
    if (t.type === "keyword") {
      if (["true", "false", "null", "this"].includes(t.value)) {
        return { kind: "keyword", value: t.value as "true" | "false" | "null" | "this" };
      }
      this.fail(`表达式中不允许关键字 '${t.value}'`, t.line);
    }
    if (t.value === "(") {
      const e = this.parseExpr();
      this.expect(")");
      return e;
    }
    if (t.value === "-" || t.value === "~") {
      return { kind: "unary", op: t.value, operand: this.parseTerm() };
    }
    if (t.type === "identifier") {
      const nxt = this.peek()?.value;
      if (nxt === "[") {
        this.next();
        const index = this.parseExpr();
        this.expect("]");
        return { kind: "index", name: t.value, index };
      }
      if (nxt === "(" || nxt === ".") {
        return this.parseCallAfterIdentifier(t.value, t.line);
      }
      return { kind: "var", name: t.value };
    }
    this.fail(`表达式中非法的记号 '${t.value}'`, t.line);
  }
}

export function parseJack(
  tokens: Token[],
  file: string,
): { ok: true; ast: ClassNode } | { ok: false; errors: JackError[] } {
  try {
    return { ok: true, ast: new Parser(tokens, file).parseClass() };
  } catch (e) {
    if (e && typeof e === "object" && "message" in e && "line" in e) {
      return { ok: false, errors: [e as JackError] };
    }
    throw e;
  }
}
