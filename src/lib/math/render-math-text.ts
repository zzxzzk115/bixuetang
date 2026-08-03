import { renderLatex } from "./render-latex";

const BARE_MATH_RUN =
  /[A-Za-z0-9\u0370-\u03ff\u0300-\u036f\\_^{}()[\].,+\-*/=<>|!:'"\u00b2\u00b3\u2070-\u209f\u2190-\u22ff]+/gu;

const MATH_COMMAND =
  /\\(?:frac|dfrac|tfrac|sqrt|sum|prod|int|lim|log|ln|sin|cos|tan|exp|max|min|det|arg|nabla|partial|mathbf|mathrm|mathbb|mathcal|operatorname|left|right|cdot|times|leq|geq|neq|approx|infty|lambda|theta|alpha|beta|gamma|sigma|mu|pi)\b/;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function looksLikeBareMath(source: string): boolean {
  const value = source.trim();
  if (!value || value.length > 240) return false;
  if (MATH_COMMAND.test(value)) return true;
  if (/[\u2211\u222b\u221a\u221e\u2260\u2264\u2265\u2248\u2208\u2209\u2282\u2286\u222a\u2229]/u.test(value)) {
    return true;
  }
  if (/\^|[\u00b2\u00b3\u2070-\u209f]/u.test(value)) return true;
  if (/^[A-Za-z\u0370-\u03ff](?:'+)?\([^()]{1,40}\)$/u.test(value)) {
    return true;
  }

  // Treat R_i and x_{n+1} as math, but leave identifiers such as ROW_NUMBER alone.
  if (/(?:^|[^A-Za-z])(?:[A-Za-z]|[\u0370-\u03ff])_(?:\{|\d|(?:[A-Za-z\u0370-\u03ff](?![A-Za-z_])))/u.test(value)) {
    return true;
  }

  // Equations whose left side is a conventional one- or two-letter variable.
  // Longer assignments such as foo=bar are usually code and stay as prose.
  return /(?:^|[\s(])(?:[A-Za-z\u0370-\u03ff]{1,2}(?:\([^)=<>]{1,40}\))?|[A-Za-z\u0370-\u03ff](?:[_^]\{?[^\s=<>]+\}?))\s*(?:={1,2}|<|>)\s*\S/u.test(
    value,
  );
}

function renderBareMath(text: string): string {
  let html = "";
  let cursor = 0;

  for (const match of text.matchAll(BARE_MATH_RUN)) {
    const index = match.index;
    const run = match[0];
    html += escapeHtml(text.slice(cursor, index));

    const leading = run.match(/^\s*/u)?.[0] ?? "";
    const trailing = run.match(/[\s.,;:!?]*$/u)?.[0] ?? "";
    const candidate = run.slice(leading.length, run.length - trailing.length);
    const rendered = looksLikeBareMath(candidate)
      ? renderLatex(candidate)
      : null;

    html += escapeHtml(leading);
    html += rendered
      ? `<span class="analysis-inline-math">${rendered}</span>`
      : escapeHtml(candidate);
    html += escapeHtml(trailing);
    cursor = index + run.length;
  }

  return html + escapeHtml(text.slice(cursor));
}

function dollarCanOpen(text: string, index: number): boolean {
  const next = text[index + 1];
  // Avoid treating shell parameters ($0, $@, $?, $_...) as math delimiters.
  return !!next && !/[\s0-9@#?_*!-]/u.test(next);
}

/**
 * Render prose containing inline math without trusting any source HTML.
 *
 * Supported explicit delimiters: $...$, $$...$$, \(...\), and \[...\].
 * Existing AI notes also contain undelimited forms such as x_{n+1}, A^TA,
 * and A=Q Lambda Q^T, so conservative bare-math recognition covers those forms.
 */
export function renderMathText(text: string): string {
  let html = "";
  let plainStart = 0;
  let index = 0;

  while (index < text.length) {
    let open = "";
    let close = "";
    let display = false;

    if (text.startsWith("$$", index)) {
      open = close = "$$";
      display = true;
    } else if (text.startsWith("\\(", index)) {
      open = "\\(";
      close = "\\)";
    } else if (text.startsWith("\\[", index)) {
      open = "\\[";
      close = "\\]";
      display = true;
    } else if (text[index] === "$" && dollarCanOpen(text, index)) {
      open = close = "$";
    }

    if (!open) {
      index += 1;
      continue;
    }

    const bodyStart = index + open.length;
    const closeAt = text.indexOf(close, bodyStart);
    if (closeAt < 0 || (open === "$" && text.slice(bodyStart, closeAt).includes("\n"))) {
      index += open.length;
      continue;
    }

    const source = text.slice(bodyStart, closeAt).trim();
    const rendered = source ? renderLatex(source, { display }) : null;
    if (!rendered) {
      index += open.length;
      continue;
    }

    html += renderBareMath(text.slice(plainStart, index));
    html += display
      ? `<span class="analysis-display-math">${rendered}</span>`
      : `<span class="analysis-inline-math">${rendered}</span>`;
    index = closeAt + close.length;
    plainStart = index;
  }

  return html + renderBareMath(text.slice(plainStart));
}

