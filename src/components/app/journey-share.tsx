"use client";

import { useEffect, useState } from "react";
import { ClipboardCopy, Download, Loader2, Share2, Share as ShareIcon, X } from "lucide-react";
import { drawJourneyCard } from "@/lib/share-card";

// 学习足迹分享:按钮 + 弹层。生成带头像与推广二维码的足迹战报图,复制/保存/系统分享。

interface Stat {
  value: string;
  label: string;
}

export function JourneyShare({
  name,
  avatarUrl,
  subtitle,
  stats,
}: {
  name: string;
  avatarUrl: string | null;
  subtitle: string;
  stats: Stat[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="journey-share-btn" onClick={() => setOpen(true)}>
        <ShareIcon size={16} aria-hidden /> 分享我的足迹
      </button>
      {open && (
        <JourneySharePopup
          name={name}
          avatarUrl={avatarUrl}
          subtitle={subtitle}
          stats={stats}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function JourneySharePopup({
  name,
  avatarUrl,
  subtitle,
  stats,
  onClose,
}: {
  name: string;
  avatarUrl: string | null;
  subtitle: string;
  stats: Stat[];
  onClose: () => void;
}) {
  const [card, setCard] = useState<{ url: string; blob: Blob } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const link = typeof window !== "undefined" ? window.location.origin : "https://bixuetang.com";
    void drawJourneyCard({ name, avatarUrl, logoUrl: "/icon-192.png", link, subtitle, stats }).then(
      (canvas) => {
        canvas.toBlob((b) => {
          if (cancelled || !b) return;
          setCard((prev) => {
            if (prev) URL.revokeObjectURL(prev.url);
            return { url: URL.createObjectURL(b), blob: b };
          });
        }, "image/png");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [name, avatarUrl, subtitle, stats]);

  function flash(t: string) {
    setMsg(t);
    setTimeout(() => setMsg(null), 2200);
  }

  const isDesktop =
    typeof document !== "undefined" &&
    document.documentElement.dataset.device !== "mobile";

  function download() {
    if (!card) return;
    const a = document.createElement("a");
    a.href = card.url;
    a.download = "必学堂-学习足迹.png";
    a.click();
    flash("已保存");
  }
  async function copyImage() {
    if (!card) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": card.blob })]);
      flash("图片已复制,粘贴即可发出");
    } catch {
      download();
    }
  }
  async function systemShare() {
    if (!card) return;
    const file = new File([card.blob], "journey.png", { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: "我的学习足迹 · 必学堂", files: [file] });
      } catch {
        /* 取消 */
      }
    } else {
      flash("此浏览器不支持系统分享,可保存图片");
    }
  }

  return (
    <div className="share-pop-mask" onClick={onClose}>
      <div className="share-pop" onClick={(e) => e.stopPropagation()}>
        <header>
          <div className="share-pop-tabs">
            <button className="on">学习足迹</button>
          </div>
          <button className="share-pop-close" onClick={onClose} aria-label="关闭">
            <X size={20} strokeWidth={2.6} aria-hidden />
          </button>
        </header>

        <div className="share-pop-preview">
          {card ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob 预览,不走优化管线
            <img src={card.url} alt="足迹图预览" />
          ) : (
            <span className="share-pop-loading">
              <Loader2 size={22} className="spin" aria-hidden />
              生成足迹图…
            </span>
          )}
        </div>

        <div className="share-pop-actions">
          {isDesktop ? (
            <button className="app-btn-primary" onClick={() => void copyImage()} disabled={!card}>
              <ClipboardCopy size={16} aria-hidden /> 复制图片
            </button>
          ) : (
            <button className="app-btn-primary" onClick={download} disabled={!card}>
              <Download size={16} aria-hidden /> 保存图片
            </button>
          )}
          <button className="app-btn-plain" onClick={() => void systemShare()} disabled={!card}>
            <Share2 size={16} aria-hidden /> 分享
          </button>
        </div>
        <p className="share-pop-note">晒出你的坚持,扫码的人就来必学堂开启自学。</p>
        {msg && <p className="share-pop-msg">{msg}</p>}
      </div>
    </div>
  );
}
