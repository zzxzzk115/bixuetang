"use client";

import { useCallback, useRef } from "react";
import {
  Bold,
  Code,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pencil,
  Quote,
} from "lucide-react";

// 通用 Markdown 编辑器:工具栏(标题/加粗/斜体/代码/引用/列表/链接)+
// 编辑/预览切换。所有笔记入口(播放器内速记层、评论区笔记面板的新建与
// 编辑框)共用这一个,避免每处各写一遍工具栏。
//
// 预览走 @/lib/markdown 的安全渲染器(先整体转义再变换),不引第三方。

import { renderMarkdown } from "@/lib/markdown";

interface Props {
  value: string;
  onChange: (next: string) => void;
  onFocus?: () => void;
  preview: boolean;
  onTogglePreview: () => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  autoFocus?: boolean;
  /** 工具栏尾部额外插槽(如「取当前时间」按钮) */
  toolbarExtra?: React.ReactNode;
}

/** 行首前缀型语法(标题/引用/列表):对选区涉及的每一行加/去前缀 */
type LinePrefix = { prefix: string };
/** 包裹型语法(加粗/斜体/代码):在选区两侧包标记 */
type Wrap = { wrap: string };
type Action = LinePrefix | Wrap | { link: true };

export function MarkdownEditor({
  value,
  onChange,
  onFocus,
  preview,
  onTogglePreview,
  placeholder,
  rows = 4,
  maxLength = 8000,
  autoFocus,
  toolbarExtra,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const apply = useCallback(
    (ta: HTMLTextAreaElement, action: Action) => {
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);

    let next = value;
    let caretStart = start;
    let caretEnd = end;

    if ("wrap" in action) {
      const mark = action.wrap;
      const inner = selected || (mark === "`" ? "代码" : "文字");
      next = value.slice(0, start) + mark + inner + mark + value.slice(end);
      caretStart = start + mark.length;
      caretEnd = caretStart + inner.length;
    } else if ("link" in action) {
      const text = selected || "链接文字";
      const snippet = `[${text}](https://)`;
      next = value.slice(0, start) + snippet + value.slice(end);
      // 光标落在 url 处方便直接粘贴
      caretStart = start + text.length + 3;
      caretEnd = caretStart + 8; // "https://"
    } else {
      // 行首前缀:覆盖选区涉及的所有整行
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const lineEndRaw = value.indexOf("\n", end);
      const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
      const block = value.slice(lineStart, lineEnd);
      const lines = block.split("\n");
      const allPrefixed = lines.every((l) => l.startsWith(action.prefix));
      const nextBlock = lines
        .map((l) =>
          allPrefixed ? l.slice(action.prefix.length) : action.prefix + l,
        )
        .join("\n");
      next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd);
      caretStart = lineStart;
      caretEnd = lineStart + nextBlock.length;
    }

    onChange(next.slice(0, maxLength));
    // 变更后把光标/选区还原到语义位置
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caretStart, caretEnd);
    });
    },
    [value, onChange, maxLength],
  );

  const tools: {
    key: string;
    label: string;
    icon: React.ReactNode;
    action: Action;
  }[] = [
    { key: "h1", label: "标题 1", icon: <Heading1 size={15} />, action: { prefix: "# " } },
    { key: "h2", label: "标题 2", icon: <Heading2 size={15} />, action: { prefix: "## " } },
    { key: "h3", label: "标题 3", icon: <Heading3 size={15} />, action: { prefix: "### " } },
    { key: "b", label: "加粗", icon: <Bold size={15} />, action: { wrap: "**" } },
    { key: "i", label: "斜体", icon: <Italic size={15} />, action: { wrap: "*" } },
    { key: "code", label: "行内代码", icon: <Code size={15} />, action: { wrap: "`" } },
    { key: "quote", label: "引用", icon: <Quote size={15} />, action: { prefix: "> " } },
    { key: "ul", label: "无序列表", icon: <List size={15} />, action: { prefix: "- " } },
    { key: "ol", label: "有序列表", icon: <ListOrdered size={15} />, action: { prefix: "1. " } },
    { key: "link", label: "链接", icon: <LinkIcon size={15} />, action: { link: true } },
  ];

  return (
    <div className="md-editor">
      <div className="md-editor-toolbar">
        {!preview &&
          tools.map((t) => (
            <button
              key={t.key}
              type="button"
              className="md-editor-tool"
              title={t.label}
              aria-label={t.label}
              // mousedown 而非 click:别让 textarea 先失焦丢了选区。
              // 先把 ref 存进局部变量再传给 apply(直接传 ref.current 会被
              // react-hooks/refs 判成渲染期读 ref)。
              onMouseDown={(e) => {
                e.preventDefault();
                // 事件处理器里读 ref 本就允许;.map 内联让静态分析误判,单行豁免
                // eslint-disable-next-line react-hooks/refs
                const ta = taRef.current;
                if (ta) apply(ta, t.action);
              }}
            >
              {t.icon}
            </button>
          ))}
        <span className="md-editor-toolbar-gap" />
        {toolbarExtra}
        <button
          type="button"
          className={`md-editor-tool md-editor-preview ${preview ? "on" : ""}`}
          title={preview ? "回到编辑" : "预览"}
          onClick={onTogglePreview}
        >
          {preview ? <Pencil size={15} /> : <Eye size={15} />}
          <span>{preview ? "编辑" : "预览"}</span>
        </button>
      </div>
      {preview ? (
        <div
          className="md-editor-preview-body video-notes-md"
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(value) || "<p style='opacity:.5'>(空)</p>",
          }}
        />
      ) : (
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          autoFocus={autoFocus}
        />
      )}
    </div>
  );
}
