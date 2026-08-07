"use client";

import { useEffect, useState } from "react";
import {
  Copy,
  Download,
  Loader2,
  MessageCircle,
  Share2,
  X,
} from "lucide-react";
import { drawShareCard } from "@/lib/share-card";

// 分享弹层:选「分享本站」或「分享原站(bilibili)」,生成对应风格的
// 分享图(封面+标题+品牌+二维码)。
// 一键分享:系统分享(Web Share,手机上能直达微信/QQ)、QQ/微博网页分享;
// 微信没有网页触达通道,提示保存图片后发送(图上二维码即入口)。

type Mode = "site" | "bili";

export function SharePopup({
  open,
  onClose,
  courseId,
  courseTitle,
  episodeTitle,
  episodeN,
  bvid,
  page,
}: {
  open: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle: string;
  episodeTitle: string;
  episodeN: number;
  bvid: string;
  page: number;
}) {
  const [mode, setMode] = useState<Mode>("site");
  /** 生成结果带 key:mode 切换时旧图自然失效,不用在 effect 里同步清空 */
  const [card, setCard] = useState<{
    key: string;
    url: string;
    blob: Blob;
  } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const cardKey = `${bvid}:${mode}`;
  const imgUrl = card?.key === cardKey ? card.url : null;
  const blob = card?.key === cardKey ? card.blob : null;

  const siteLink =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/courses/${courseId}?ep=${episodeN}`;
  const biliLink = `https://www.bilibili.com/video/${bvid}${page > 1 ? `?p=${page}` : ""}`;
  const link = mode === "site" ? siteLink : biliLink;
  const shareTitle = `${courseTitle} · 第 ${episodeN} 集 ${episodeTitle}`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void drawShareCard({
      mode,
      coverUrl: `/api/bili/cover?bvid=${encodeURIComponent(bvid)}`,
      logoUrl: "/icon-192.png",
      courseTitle,
      episodeTitle,
      episodeN,
      link: mode === "site" ? siteLink : biliLink,
    }).then((canvas) => {
      if (cancelled) return;
      canvas.toBlob((b) => {
        if (cancelled || !b) return;
        setCard((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { key: `${bvid}:${mode}`, url: URL.createObjectURL(b), blob: b };
        });
      }, "image/png");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 链接由 mode 推导,其余入参随 key 重挂
  }, [open, mode, bvid, courseTitle, episodeTitle, episodeN]);

  if (!open) return null;

  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 2200);
  };

  const download = () => {
    if (!imgUrl) return;
    const a = document.createElement("a");
    a.href = imgUrl;
    a.download = `${courseId}-ep${episodeN}-${mode}.png`;
    a.click();
    flash("已保存,微信里发图即可分享");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      flash("链接已复制");
    } catch {
      flash("复制失败,长按链接手动复制");
    }
  };

  const systemShare = async () => {
    if (!navigator.share) {
      flash("此浏览器不支持系统分享,可保存图片");
      return;
    }
    try {
      if (blob && navigator.canShare?.({ files: [new File([blob], "share.png", { type: "image/png" })] })) {
        await navigator.share({
          title: shareTitle,
          text: shareTitle,
          url: link,
          files: [new File([blob], "share.png", { type: "image/png" })],
        });
      } else {
        await navigator.share({ title: shareTitle, text: shareTitle, url: link });
      }
    } catch {
      // 用户取消,不打扰
    }
  };

  const qqShare = () => {
    window.open(
      `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(link)}&title=${encodeURIComponent(shareTitle)}&summary=${encodeURIComponent("在必学堂用游戏化的方式自学公开课")}`,
      "_blank",
      "noopener",
    );
  };

  const weiboShare = () => {
    window.open(
      `https://service.weibo.com/share/share.php?url=${encodeURIComponent(link)}&title=${encodeURIComponent(shareTitle)}`,
      "_blank",
      "noopener",
    );
  };

  return (
    <div className="share-pop-mask" onClick={onClose}>
      <div className="share-pop" onClick={(e) => e.stopPropagation()}>
        <header>
          <div className="share-pop-tabs">
            <button
              className={mode === "site" ? "on" : undefined}
              onClick={() => setMode("site")}
            >
              分享本站
            </button>
            <button
              className={mode === "bili" ? "on bili" : "bili"}
              onClick={() => setMode("bili")}
            >
              分享原站
            </button>
          </div>
          <button className="share-pop-close" onClick={onClose} aria-label="关闭">
            <X size={20} strokeWidth={2.6} aria-hidden />
          </button>
        </header>

        <div className="share-pop-preview">
          {imgUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob URL 预览,不走优化管线
            <img src={imgUrl} alt="分享图预览" />
          ) : (
            <span className="share-pop-loading">
              <Loader2 size={22} className="spin" aria-hidden />
              生成分享图…
            </span>
          )}
        </div>

        <div className="share-pop-actions">
          <button className="app-btn-primary" onClick={download} disabled={!imgUrl}>
            <Download size={16} aria-hidden /> 保存图片
          </button>
          <button className="app-btn-plain" onClick={systemShare} disabled={!imgUrl}>
            <Share2 size={16} aria-hidden /> 系统分享
          </button>
          <button className="app-btn-plain" onClick={copyLink}>
            <Copy size={16} aria-hidden /> 复制链接
          </button>
          <button className="app-btn-plain" onClick={qqShare}>
            <MessageCircle size={16} aria-hidden /> QQ
          </button>
          <button className="app-btn-plain" onClick={weiboShare}>
            微博
          </button>
        </div>
        <p className="share-pop-note">
          微信没有网页分享通道:保存图片发给好友/朋友圈即可,
          对方长按识别图上二维码直达;手机上「系统分享」也能直接选微信。
        </p>
        {msg && <p className="share-pop-msg">{msg}</p>}
      </div>
    </div>
  );
}
