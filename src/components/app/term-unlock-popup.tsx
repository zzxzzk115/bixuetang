"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BookOpen, X } from "lucide-react";

// 看完一集后弹一下「这集让你第一次见到这些词」。
//
// 卷宗里的词条是跟着看过的集长出来的，不弹一下用户根本不知道自己
// 刚刚多了几条——那这个解锁就等于没发生。

export interface UnlockedTerm {
  term: string;
  definition: string;
}

export function TermUnlockPopup({
  terms,
  onClose,
}: {
  terms: UnlockedTerm[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (terms.length === 0) return null;

  return (
    <div className="app-sheet-backdrop" onClick={onClose}>
      <div
        className="app-sheet term-unlock"
        role="dialog"
        aria-label="解锁了新词条"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <b>
            <BookOpen size={17} aria-hidden /> 卷宗 +{terms.length}
          </b>
          <button onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </header>
        <p className="term-unlock-lead">这一集让你第一次见到这些词</p>
        <ul className="term-unlock-list">
          {terms.map((t) => (
            <li key={t.term}>
              <b>{t.term}</b>
              <small>{t.definition}</small>
            </li>
          ))}
        </ul>
        <Link className="app-btn-plain" href="/glossary">
          去卷宗看看
        </Link>
      </div>
    </div>
  );
}
