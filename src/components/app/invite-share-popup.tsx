"use client";

import { useEffect, useState } from "react";
import { ClipboardCopy, Download, Loader2, Share2, X } from "lucide-react";
import { drawInviteCard } from "@/lib/share-card";

// 邀请分享图弹层:生成带二维码的邀请图(drawInviteCard),给复制图片/保存/系统分享。
// 复用 share-pop 的样式与图片处理逻辑,与课程分享图一脉相承。

export function InviteSharePopup({
  onClose,
  inviterName,
  link,
}: {
  onClose: () => void;
  inviterName: string;
  link: string;
}) {
  const [card, setCard] = useState<{ url: string; blob: Blob } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void drawInviteCard({
      inviterName,
      logoUrl: "/icon-192.png",
      link,
    }).then((canvas) => {
      canvas.toBlob((b) => {
        if (cancelled || !b) return;
        setCard((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { url: URL.createObjectURL(b), blob: b };
        });
      }, "image/png");
    });
    return () => {
      cancelled = true;
    };
  }, [inviterName, link]);

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
    a.download = "必学堂-邀请.png";
    a.click();
    flash("已保存,发给好友即可");
  }
  async function copyImage() {
    if (!card) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": card.blob }),
      ]);
      flash("图片已复制,聊天窗口里粘贴即可");
    } catch {
      download();
    }
  }
  async function systemShare() {
    if (!card) return;
    const file = new File([card.blob], "invite.png", { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: "必学堂 · 邀请你一起学", files: [file] });
      } catch {
        /* 用户取消 */
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
            <button className="on">邀请好友</button>
          </div>
          <button className="share-pop-close" onClick={onClose} aria-label="关闭">
            <X size={20} strokeWidth={2.6} aria-hidden />
          </button>
        </header>

        <div className="share-pop-preview">
          {card ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob 预览,不走优化管线
            <img src={card.url} alt="邀请图预览" />
          ) : (
            <span className="share-pop-loading">
              <Loader2 size={22} className="spin" aria-hidden />
              生成邀请图…
            </span>
          )}
        </div>

        <div className="share-pop-actions">
          {isDesktop ? (
            <button
              className="app-btn-primary"
              onClick={() => void copyImage()}
              disabled={!card}
            >
              <ClipboardCopy size={16} aria-hidden /> 复制图片
            </button>
          ) : (
            <button
              className="app-btn-primary"
              onClick={download}
              disabled={!card}
            >
              <Download size={16} aria-hidden /> 保存图片
            </button>
          )}
          <button
            className="app-btn-plain"
            onClick={() => void systemShare()}
            disabled={!card}
          >
            <Share2 size={16} aria-hidden /> 分享
          </button>
        </div>
        <p className="share-pop-note">
          扫码即注册成为你的好友;TA 完成新手引导后,你得 +50 XP、+100 金币。
        </p>
        {msg && <p className="share-pop-msg">{msg}</p>}
      </div>
    </div>
  );
}
