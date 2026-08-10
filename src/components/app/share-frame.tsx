"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ClipboardCopy, Download, Loader2, Share2, X } from "lucide-react";

// 分享图弹层的共用骨架:课程分享 / 邀请 / 学习足迹 三处此前各写一份几乎相同的
// canvas→blob→预览 + 复制/保存/系统分享 逻辑与弹层结构。这里抽成一个 hook + 一个壳。

interface ShareCardOpts {
  /** 下载文件名(也用作系统分享的文件名) */
  filename: string;
  /** 系统分享标题 */
  shareTitle: string;
  /** 系统分享附带的链接(课程分享用;邀请/足迹图只发图不带链接) */
  shareUrl?: string;
  /** 系统分享附带的文字 */
  shareText?: string;
  copyToast?: string;
  saveToast?: string;
  /** 关闭时不画卡(课程分享弹层常驻挂载,用 open 控制) */
  enabled?: boolean;
}

interface ShareCard {
  url: string;
  blob: Blob;
}

/** 画卡 → toBlob → objectURL,并给出复制/保存/系统分享三个动作。deps 变化即重画。 */
export function useShareCard(
  draw: () => Promise<HTMLCanvasElement>,
  deps: React.DependencyList,
  opts: ShareCardOpts,
) {
  const [card, setCard] = useState<ShareCard | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const enabled = opts.enabled ?? true;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // 不在此清空旧图:重画期间保留上一张(切模式不闪 loading),初次 card 为 null 自然显加载态
    void draw().then((canvas) => {
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
    // draw 是每次渲染新建的闭包,只按数据 deps 触发重画
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(null), 2200);
  };

  const download = () => {
    if (!card) return;
    const a = document.createElement("a");
    a.href = card.url;
    a.download = opts.filename;
    a.click();
    flash(opts.saveToast ?? "已保存");
  };

  const copyImage = async () => {
    if (!card) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": card.blob })]);
      flash(opts.copyToast ?? "图片已复制,粘贴即可发出");
    } catch {
      download();
    }
  };

  const systemShare = async () => {
    if (!card) return;
    const file = new File([card.blob], opts.filename, { type: "image/png" });
    const withMeta = (extra: Record<string, unknown>) => ({
      title: opts.shareTitle,
      ...(opts.shareText ? { text: opts.shareText } : {}),
      ...(opts.shareUrl ? { url: opts.shareUrl } : {}),
      ...extra,
    });
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(withMeta({ files: [file] }));
      } else if (opts.shareUrl && navigator.share) {
        // 不支持发图但有链接:退化为纯链接分享(邀请/足迹图无链接则不走这条)
        await navigator.share(withMeta({}));
      } else {
        flash("此浏览器不支持系统分享,可保存图片");
      }
    } catch {
      /* 用户取消 */
    }
  };

  const isDesktop =
    typeof document !== "undefined" &&
    document.documentElement.dataset.device !== "mobile";

  return { card, msg, flash, download, copyImage, systemShare, isDesktop };
}

/** 分享弹层外壳:遮罩 + 卡片 + 头部(tab/关闭)+ 预览 + 动作行 + 说明 + 提示。 */
export function SharePopupFrame({
  onClose,
  tabs,
  loadingLabel,
  imgAlt,
  note,
  extraActions,
  share,
}: {
  onClose: () => void;
  /** 头部左侧的 tab 区(单静态标签或多切换标签) */
  tabs: ReactNode;
  loadingLabel: string;
  imgAlt: string;
  note?: ReactNode;
  /** 主动作(复制/保存/分享)之外的附加动作,如「复制链接」 */
  extraActions?: ReactNode;
  share: ReturnType<typeof useShareCard>;
}) {
  const { card, msg, isDesktop, copyImage, download, systemShare } = share;
  return (
    <div className="share-pop-mask" onClick={onClose}>
      <div className="share-pop" onClick={(e) => e.stopPropagation()}>
        <header>
          <div className="share-pop-tabs">{tabs}</div>
          <button className="share-pop-close" onClick={onClose} aria-label="关闭">
            <X size={20} strokeWidth={2.6} aria-hidden />
          </button>
        </header>

        <div className="share-pop-preview">
          {card ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob 预览,不走优化管线
            <img src={card.url} alt={imgAlt} />
          ) : (
            <span className="share-pop-loading">
              <Loader2 size={22} className="spin" aria-hidden />
              {loadingLabel}
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
          {extraActions}
        </div>

        {note && <p className="share-pop-note">{note}</p>}
        {msg && <p className="share-pop-msg">{msg}</p>}
      </div>
    </div>
  );
}
