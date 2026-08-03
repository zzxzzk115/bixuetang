import assert from "node:assert/strict";
import { test } from "node:test";
import { renderLatex } from "./render-latex";

test("渲染出 KaTeX 结构", () => {
  const html = renderLatex("a^2 + b^2 = c^2");
  assert.ok(html);
  assert.match(html, /class="katex"/);
  // 含 MathML 语义层，屏幕阅读器与复制粘贴都能用
  assert.match(html, /<math/);
});

test("display 模式与行内模式产出不同", () => {
  const inline = renderLatex("\\sum_{i=1}^{n} i");
  const display = renderLatex("\\sum_{i=1}^{n} i", { display: true });
  assert.ok(inline && display);
  assert.notEqual(inline, display);
  assert.match(display, /katex-display/);
});

test("公式里夹中文注释不报错（strict 关闭）", () => {
  const html = renderLatex("S \\cap T \\text{ 一定是子空间}");
  assert.ok(html, "带 \\text{中文} 的公式应能渲染");
  assert.match(html, /class="katex"/);
});

test("非法 LaTeX 返回 null 而不是抛出或红字", () => {
  assert.equal(renderLatex("\\frac{1"), null);
  assert.equal(renderLatex("\\nosuchcommand{x}"), null);
});

test("空串返回 null", () => {
  assert.equal(renderLatex(""), null);
  assert.equal(renderLatex("   "), null);
});

test("真实语料：分析产物里的公式都能渲染", () => {
  const samples = [
    "\\forall t_1, t_2 \\in R,\\ t_1 \\neq t_2 \\Rightarrow t_1.\\mathrm{PK} \\neq t_2.\\mathrm{PK}",
    "\\pi_{FK}(R) \\subseteq \\pi_{PK}(S)",
    "\\mathrm{offset}(c_k) = \\sum_{i=1}^{k-1} \\mathrm{size}(c_i)",
    "0.1 + 0.2 \\neq 0.3 \\quad (\\text{IEEE 754 binary64})",
    "h(k) = \\mathrm{hash}(k) \\bmod N",
    "O(\\log_M n)",
    "N(A) = \\{\\mathbf{x} \\in \\mathbb{R}^{n} : A\\mathbf{x} = \\mathbf{0}\\}",
    "A\\mathbf{x} = \\mathbf{b} \\text{ 有解} \\iff \\mathbf{b} \\in C(A)",
  ];
  for (const s of samples) {
    assert.ok(renderLatex(s), `渲染失败：${s}`);
  }
});
