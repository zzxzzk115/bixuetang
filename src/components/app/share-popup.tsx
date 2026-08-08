"use client";

import { useEffect, useState } from "react";
import {
  ClipboardCopy,
  Copy,
  Download,
  Loader2,
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
  viewerId,
}: {
  open: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle: string;
  episodeTitle: string;
  episodeN: number;
  bvid: string;
  page: number;
  /** 当前用户 id:分享链接带 ?ref= 做拉新归因 */
  viewerId?: number;
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

  // 本站链接:配了域名走域名;开发环境 localhost 换成局域网地址
  // (服务端探测后写在 data-lan-origin)——手机扫 localhost 毫无意义
  const siteOrigin = (() => {
    if (typeof window === "undefined") return "";
    const lan = document.documentElement.dataset.lanOrigin;
    if (lan && /^(localhost|127\.)/.test(window.location.hostname)) return lan;
    return window.location.origin;
  })();
  const siteLink = siteOrigin
    ? `${siteOrigin}/courses/${courseId}?ep=${episodeN}${viewerId ? `&ref=${viewerId}` : ""}`
    : "";
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

  // 设备形态由服务端 UA 写在 <html data-device>(iPad 由客户端矫正),
  // 桌面主按钮是「复制图片」——聊天窗口 Ctrl+V 直接贴,比存文件顺手
  const isDesktop =
    typeof document !== "undefined" &&
    document.documentElement.dataset.device !== "mobile";

  const download = () => {
    if (!imgUrl) return;
    const a = document.createElement("a");
    a.href = imgUrl;
    a.download = `${courseId}-ep${episodeN}-${mode}.png`;
    a.click();
    flash("已保存,微信里发图即可分享");
  };

  const copyImage = async () => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      flash("图片已复制,聊天窗口里粘贴即可");
    } catch {
      // 剪贴板被策略拦住就退回下载
      download();
    }
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
          {isDesktop ? (
            // 桌面:复制到剪贴板,聊天窗口 Ctrl+V 直接贴,比存文件顺手
            <button
              className="app-btn-primary"
              onClick={() => void copyImage()}
              disabled={!imgUrl}
            >
              <ClipboardCopy size={16} aria-hidden /> 复制图片
            </button>
          ) : (
            <button
              className="app-btn-primary"
              onClick={download}
              disabled={!imgUrl}
            >
              <Download size={16} aria-hidden /> 保存图片
            </button>
          )}
          <button className="app-btn-plain" onClick={copyLink}>
            <Copy size={16} aria-hidden /> 复制链接
          </button>
          <button className="app-btn-plain" onClick={systemShare} disabled={!imgUrl}>
            <Share2 size={16} aria-hidden /> 分享
          </button>
        </div>
        <p className="share-pop-note">
          {isDesktop
            ? "复制后到微信/QQ 聊天窗口粘贴即可;图上二维码就是入口。"
            : "「分享」走系统面板,可直接选微信/QQ(带图带链接);也可保存图片后发送。"}
        </p>
        {msg && <p className="share-pop-msg">{msg}</p>}
      </div>
    </div>
  );
}
