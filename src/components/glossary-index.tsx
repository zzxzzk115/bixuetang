"use client";

import { useEffect, useRef, useState } from "react";

export interface GlossaryIndexItem {
  key: string;
  id: string;
  count: number;
}

/** 少于这个数量就不出索引条 */
const MIN_TERMS_FOR_INDEX = 12;

export function GlossaryIndex({ items }: { items: GlossaryIndexItem[] }) {
  const railRef = useRef<HTMLElement | null>(null);
  const dragging = useRef(false);
  const lastIndex = useRef(-1);
  const [active, setActive] = useState(items[0]?.key ?? "");
  /**
   * 词条一屏就装得下时不显示索引条——本来就尽收眼底，
   * 放个快速定位条纯属噪声，还占掉右侧一条宽度。
   *
   * 判定用词条总数而不是量 DOM：量高度要么撞上反馈环
   * （索引条自己把页面撑高 → 判定「需要滚动」→ 于是显示自己），
   * 要么依赖 ResizeObserver 的建立时机，都不稳。
   * 一屏大致放得下八九条，这里留足余量。
   */
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const needed = total > MIN_TERMS_FOR_INDEX;

  // scroll-spy：滚到哪个分区，条上就高亮哪个字母（拖拽中不抢状态）
  useEffect(() => {
    if (!needed) return;
    const scroller =
      document.querySelector<HTMLElement>(".app-page") ??
      document.documentElement;
    let raf = 0;
    const update = () => {
      if (dragging.current) return;
      let current = items[0]?.key ?? "";
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 140) current = item.key;
        else break;
      }
      setActive(current);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [items, needed]);

  const jump = (index: number, smooth: boolean) => {
    const item = items[index];
    if (!item || index === lastIndex.current) return;
    lastIndex.current = index;
    setActive(item.key);
    document.getElementById(item.id)?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "start",
    });
  };

  const jumpFromY = (clientY: number) => {
    const rail = railRef.current;
    if (!rail || items.length === 0) return;
    const rect = rail.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(0.9999, (clientY - rect.top) / rect.height),
    );
    jump(Math.floor(ratio * items.length), false);
  };

  if (!needed || items.length === 0) return null;

  return (
    <div className="lex-rail-slot">
      <nav
        ref={railRef}
        className="glossary-index-rail"
        aria-label="术语首字符快速索引"
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          jumpFromY(event.clientY);
        }}
        onPointerMove={(event) => {
          if (dragging.current) jumpFromY(event.clientY);
        }}
        onPointerUp={(event) => {
          dragging.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        <span className="glossary-index-caption">INDEX</span>
        <div className="glossary-index-items">
          {items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              className={active === item.key ? "active" : ""}
              title={`${item.key} · ${item.count} 条`}
              aria-label={`跳转到 ${item.key}，共 ${item.count} 条术语`}
              onClick={(event) => {
                event.stopPropagation();
                lastIndex.current = -1;
                jump(index, true);
              }}
            >
              {item.key}
            </button>
          ))}
        </div>
        <output className="glossary-index-indicator" aria-live="polite">
          {active}
        </output>
      </nav>
    </div>
  );
}
