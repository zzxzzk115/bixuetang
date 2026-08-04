"use client";

import { useState, type ReactNode } from "react";

// 折叠卡（<details> 在部分布局下高度塌陷，自己管状态更稳）

export function Fold({
  icon,
  title,
  note,
  defaultOpen = false,
  children,
}: {
  icon?: ReactNode;
  title: string;
  note?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`course-fold ${open ? "open" : ""}`}>
      <button
        className="course-fold-summary"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {icon}
        {title}
        {note && <small>{note}</small>}
        <span className="course-fold-chevron" aria-hidden>
          ›
        </span>
      </button>
      {open && <div className="course-fold-body">{children}</div>}
    </section>
  );
}
