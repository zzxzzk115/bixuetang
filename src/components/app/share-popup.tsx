"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { drawShareCard } from "@/lib/share-card";
import { SharePopupFrame, useShareCard } from "./share-frame";

// 分享弹层:选「分享本站」或「分享原站(bilibili)」,生成对应风格的分享图
// (封面+标题+品牌+二维码)。复用共享的分享壳与图片处理(share-frame),
// 这里只管两种模式的链接推导与「复制链接」这一附加动作。

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
  refCode,
}: {
  open: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle: string;
  episodeTitle: string;
  episodeN: number;
  bvid: string;
  page: number;
  /** 当前用户的签名邀请码:分享链接带 ?ref= 做拉新归因(不暴露原始 id) */
  refCode?: string;
}) {
  const [mode, setMode] = useState<Mode>("site");

  // 本站链接:配了域名走域名;开发环境 localhost 换成局域网地址
  // (服务端探测后写在 data-lan-origin)——手机扫 localhost 毫无意义
  const siteOrigin = (() => {
    if (typeof window === "undefined") return "";
    const lan = document.documentElement.dataset.lanOrigin;
    if (lan && /^(localhost|127\.)/.test(window.location.hostname)) return lan;
    return window.location.origin;
  })();
  const siteLink = siteOrigin
    ? `${siteOrigin}/courses/${courseId}?ep=${episodeN}${refCode ? `&ref=${refCode}` : ""}`
    : "";
  const biliLink = `https://www.bilibili.com/video/${bvid}${page > 1 ? `?p=${page}` : ""}`;
  const link = mode === "site" ? siteLink : biliLink;
  const shareTitle = `${courseTitle} · 第 ${episodeN} 集 ${episodeTitle}`;

  const share = useShareCard(
    () =>
      drawShareCard({
        mode,
        coverUrl: `/api/bili/cover?bvid=${encodeURIComponent(bvid)}`,
        logoUrl: "/icon-192.png",
        courseTitle,
        episodeTitle,
        episodeN,
        link,
      }),
    [open, mode, bvid, courseTitle, episodeTitle, episodeN, link],
    {
      filename: `${courseId}-ep${episodeN}-${mode}.png`,
      shareTitle,
      shareUrl: link,
      shareText: shareTitle,
      copyToast: "图片已复制,聊天窗口里粘贴即可",
      saveToast: "已保存,微信里发图即可分享",
      enabled: open,
    },
  );

  if (!open) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      share.flash("链接已复制");
    } catch {
      share.flash("复制失败,长按链接手动复制");
    }
  };

  return (
    <SharePopupFrame
      onClose={onClose}
      tabs={
        <>
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
        </>
      }
      loadingLabel="生成分享图…"
      imgAlt="分享图预览"
      extraActions={
        <button className="app-btn-plain" onClick={() => void copyLink()}>
          <Copy size={16} aria-hidden /> 复制链接
        </button>
      }
      note={
        share.isDesktop
          ? "复制后到微信/QQ 聊天窗口粘贴即可;图上二维码就是入口。"
          : "「分享」走系统面板,可直接选微信/QQ(带图带链接);也可保存图片后发送。"
      }
      share={share}
    />
  );
}
