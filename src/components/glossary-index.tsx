"use client";

import { useEffect, useRef, useState } from "react";

export interface GlossaryIndexItem {
  key: string;
  id: string;
  count: number;
}

export function GlossaryIndex({ items }: { items: GlossaryIndexItem[] }) {
  const railRef = useRef<HTMLElement | null>(null);
  const dragging = useRef(false);
  const lastIndex = useRef(-1);
  const [active, setActive] = useState(items[0]?.key ?? "");

  // scroll-spy：滚到哪个分区，条上就高亮哪个字母（拖拽中不抢状态）
  useEffect(() => {
    const scroller =
      railRef.current?.closest(".app-page") ??
      document.scrollingElement ??
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
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [items]);

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
    const ratio = Math.max(0, Math.min(0.9999, (clientY - rect.top) / rect.height));
    jump(Math.floor(ratio * items.length), false);
  };

  return (
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
  );
}
