import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMathText } from "./render-math-text";

test("renders explicitly delimited inline and display math", () => {
  const html = renderMathText("inline $x_{n+1}=x_n^2$ and \\[A^T A\\]");
  assert.match(html, /analysis-inline-math/);
  assert.match(html, /analysis-display-math/);
  assert.match(html, /katex-display/);
});

test("renders common undelimited formulas in generated notes", () => {
  const html = renderMathText("Use x_{n+1} and A^TA x = A^Tb in the next step.");
  assert.match(html, /analysis-inline-math/);
  assert.match(html, /class="katex"/);
  assert.match(html, /^Use <span class="analysis-inline-math">/);
  assert.ok(
    (html.match(/analysis-inline-math/g) ?? []).length >= 3,
    "each bare formula fragment should render without consuming prose",
  );
  assert.match(html, /<\/span> and <span/);
  assert.match(html, /<\/span> in the next step\./);
});

test("renders conventional one-letter function notation", () => {
  const html = renderMathText("u(k+1)=A u(k), O(n)");
  assert.ok(
    (html.match(/analysis-inline-math/g) ?? []).length >= 3,
    "recurrence fragments should render independently",
  );
});

test("does not confuse code identifiers or shell parameters with math", () => {
  const source = "ROW_NUMBER and SELF_TYPE use $0, $1, $@ and foo=bar";
  const html = renderMathText(source);
  assert.equal(html, source);
});

test("escapes prose HTML while keeping KaTeX markup", () => {
  const html = renderMathText('<script>alert("x")</script> and $a^2$');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /class="katex"/);
});

test("keeps malformed delimiters as escaped source text", () => {
  const html = renderMathText("bad $\\frac{1$ <tag>");
  assert.match(html, /\$\\frac\{1\$/);
  assert.match(html, /&lt;tag&gt;/);
});
