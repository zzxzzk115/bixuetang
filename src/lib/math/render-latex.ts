import katex from "katex";

// 把知识点里的 LaTeX 排版成 HTML。
//
// 为什么用 KaTeX 而不是已有的 mathlive：mathlive 是面向浏览器的编辑器组件，
// 模块加载时就会碰 window / 自定义元素，没法在 Server Component 里跑。
// KaTeX 是纯函数式的，能在服务端渲染完再把 HTML 传给客户端组件，
// 课程页因此一行 JS 都不用为公式买单，只出 CSS 和字体。
// mathlive 继续只在 /lab/math 里用。

/**
 * 渲染失败返回 null——让调用方退回展示原始 LaTeX，
 * 而不是把 KaTeX 的红色报错糊到页面上。
 */
export function renderLatex(
  tex: string,
  opts: { display?: boolean } = {},
): string | null {
  const src = tex.trim();
  if (!src) return null;
  try {
    return katex.renderToString(src, {
      displayMode: opts.display ?? false,
      throwOnError: true,
      // strict 会把 \text{中文} 这类当成警告，而 AI 产出的公式里中文注释很常见
      strict: false,
      // 同时输出可视 HTML 与 MathML 语义层：前者负责排版，
      // 后者让屏幕阅读器能读、让用户复制公式时拿到有意义的内容
      output: "htmlAndMathml",
      trust: false,
    });
  } catch {
    return null;
  }
}
