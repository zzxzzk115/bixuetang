import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown } from "./markdown";

test("HTML 一律转义:用户写的标签不可能落地", () => {
  const out = renderMarkdown('<img src=x onerror=alert(1)> & "quote"');
  assert.ok(!out.includes("<img"));
  assert.ok(out.includes("&lt;img"));
  assert.ok(out.includes("&amp;"));
});

test("行内语法:代码/粗/斜/删除线", () => {
  const out = renderMarkdown("**粗** *斜* `code` ~~删~~");
  assert.ok(out.includes("<strong>粗</strong>"));
  assert.ok(out.includes("<em>斜</em>"));
  assert.ok(out.includes("<code>code</code>"));
  assert.ok(out.includes("<del>删</del>"));
});

test("链接只放行 http(s)", () => {
  const ok = renderMarkdown("[官网](https://example.com)");
  assert.ok(ok.includes('href="https://example.com"'));
  const bad = renderMarkdown("[x](javascript:alert(1))");
  assert.ok(!bad.includes("href"));
});

test("标题从 h3 起,不抢页面层级", () => {
  assert.ok(renderMarkdown("# 大标题").includes("<h3>大标题</h3>"));
  assert.ok(renderMarkdown("### 小标题").includes("<h5>小标题</h5>"));
});

test("列表与引用", () => {
  const out = renderMarkdown("- a\n- b\n\n1. one\n\n> 引用");
  assert.ok(out.includes("<ul><li>a</li><li>b</li></ul>"));
  assert.ok(out.includes("<ol><li>one</li></ol>"));
  assert.ok(out.includes("<blockquote>引用</blockquote>"));
});

test("围栏代码块内不做行内变换", () => {
  const out = renderMarkdown("```\n**not bold**\n```");
  assert.ok(out.includes("**not bold**"));
  assert.ok(out.includes("<pre><code>"));
  assert.ok(out.includes("</code></pre>"));
});

test("未闭合的代码块也能收尾", () => {
  const out = renderMarkdown("```\nabc");
  assert.ok(out.endsWith("</code></pre>"));
});

test("段落内单换行转 <br/>", () => {
  const out = renderMarkdown("第一行\n第二行");
  assert.ok(out.includes("第一行<br/>第二行"));
});
