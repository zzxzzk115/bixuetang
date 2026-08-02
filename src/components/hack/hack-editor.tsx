"use client";

import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { Compartment, EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, keymap, lineNumbers, type DecorationSet } from "@codemirror/view";
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

// 代码编辑器保持固定暗色（不随站点主题切换）：
// 高亮 token 配色按暗底设计，且「暗色代码岛」在浅色页面里也是惯例观感
const darkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#0b0e14",
      color: "#e7e9f0",
      fontSize: "13px",
      height: "100%",
    },
    ".cm-content": { fontFamily: "ui-monospace, Consolas, monospace" },
    ".cm-gutters": {
      backgroundColor: "#141a29",
      color: "#8b93a7",
      border: "none",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-activeLine": { backgroundColor: "rgba(245,197,66,0.05)" },
    ".cm-cursor": { borderLeftColor: "#f5c542" },
    // 单步调试时 PC 指向的那一行
    ".cm-hack-active": {
      backgroundColor: "rgba(245,197,66,0.22)",
      boxShadow: "inset 3px 0 0 #f5c542",
    },
  },
  { dark: true },
);

// 单步调试：高亮 PC 当前指向的源码行
const setActiveLine = StateEffect.define<number | null>();

const activeLineMark = Decoration.line({ class: "cm-hack-active" });

const activeLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (!e.is(setActiveLine)) continue;
      const line = e.value;
      if (line === null || line < 1 || line > tr.state.doc.lines) {
        return Decoration.none;
      }
      const pos = tr.state.doc.line(line).from;
      return Decoration.set([activeLineMark.range(pos)]);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

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
  activeLine = null,
}: {
  value: string;
  language: HackLang;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  /** 单步调试时高亮的源码行（1-based），null 表示不高亮 */
  activeLine?: number | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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
          activeLineField,
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

  // 单步调试高亮：跟随 PC 移动并滚动到可视区
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setActiveLine.of(activeLine) });
    if (activeLine !== null && activeLine >= 1 && activeLine <= view.state.doc.lines) {
      const pos = view.state.doc.line(activeLine).from;
      view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    }
  }, [activeLine]);

  return <div ref={hostRef} className="h-full min-h-64 overflow-hidden" />;
}
