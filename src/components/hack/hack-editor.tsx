"use client";

import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export type HackLang = "asm" | "jack" | "vm";

// 三个轻量 StreamLanguage 高亮器（不需要完整 lezer grammar）

const asmLang = StreamLanguage.define<{ never?: true }>({
  token(stream) {
    if (stream.match(/\/\/.*/)) return "comment";
    if (stream.match(/\(.*?\)/)) return "labelName";
    if (stream.match(/@[\w.$:]+/)) return "atom";
    if (stream.match(/J(GT|EQ|GE|LT|NE|LE|MP)/)) return "keyword";
    if (stream.match(/[ADM]+(?==)/)) return "variableName";
    if (stream.match(/[ADM01]/)) return "number";
    stream.next();
    return null;
  },
});

const JACK_KEYWORDS =
  /^(class|constructor|function|method|field|static|var|int|char|boolean|void|true|false|null|this|let|do|if|else|while|return)\b/;

const jackLang = StreamLanguage.define<{ never?: true }>({
  token(stream) {
    if (stream.match(/\/\/.*/)) return "comment";
    if (stream.match(/\/\*[\s\S]*?\*\//)) return "comment";
    if (stream.match(/"[^"]*"/)) return "string";
    if (stream.match(JACK_KEYWORDS)) return "keyword";
    if (stream.match(/\d+/)) return "number";
    if (stream.match(/[A-Z][A-Za-z0-9_]*/)) return "typeName";
    if (stream.match(/[a-z_][A-Za-z0-9_]*/)) return "variableName";
    stream.next();
    return null;
  },
});

const vmLang = StreamLanguage.define<{ never?: true }>({
  token(stream) {
    if (stream.match(/\/\/.*/)) return "comment";
    if (stream.match(/^(push|pop|add|sub|neg|eq|gt|lt|and|or|not|label|goto|if-goto|function|call|return)\b/))
      return "keyword";
    if (stream.match(/\b(argument|local|static|constant|this|that|pointer|temp)\b/))
      return "atom";
    if (stream.match(/\d+/)) return "number";
    stream.next();
    return null;
  },
});

const LANGS: Record<HackLang, StreamLanguage<unknown>> = {
  asm: asmLang,
  jack: jackLang,
  vm: vmLang,
};

const darkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--background)",
      color: "var(--foreground)",
      fontSize: "13px",
      height: "100%",
    },
    ".cm-content": { fontFamily: "ui-monospace, Consolas, monospace" },
    ".cm-gutters": {
      backgroundColor: "var(--panel)",
      color: "var(--muted)",
      border: "none",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-activeLine": { backgroundColor: "rgba(245,197,66,0.05)" },
    ".cm-cursor": { borderLeftColor: "var(--gold)" },
  },
  { dark: true },
);

const highlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.comment, color: "#6b7280", fontStyle: "italic" },
    { tag: tags.keyword, color: "#f5c542" },
    { tag: tags.atom, color: "#60a5fa" },
    { tag: tags.number, color: "#34d399" },
    { tag: tags.string, color: "#f9a8d4" },
    { tag: tags.typeName, color: "#c4b5fd" },
    { tag: tags.labelName, color: "#f97316" },
    { tag: tags.variableName, color: "#e7e9f0" },
  ]),
);

export function HackEditor({
  value,
  language,
  onChange,
  readOnly = false,
}: {
  value: string;
  language: HackLang;
  onChange?: (v: string) => void;
  readOnly?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          langCompartment.current.of(LANGS[language]),
          highlight,
          darkTheme,
          EditorState.readOnly.of(readOnly),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只初始化一次，后续用事务同步
  }, []);

  // 外部 value 变化（切文件/载 demo）→ 整体替换文档
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }
  }, [value]);

  // 语言切换
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: langCompartment.current.reconfigure(LANGS[language]),
    });
  }, [language]);

  return <div ref={hostRef} className="h-full min-h-64 overflow-hidden" />;
}
