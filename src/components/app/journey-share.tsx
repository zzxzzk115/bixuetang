"use client";

import { useState } from "react";
import { Share as ShareIcon } from "lucide-react";
import { drawJourneyCard } from "@/lib/share-card";
import { SharePopupFrame, useShareCard } from "./share-frame";

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
  const link =
    typeof window !== "undefined" ? window.location.origin : "https://bixuetang.com";
  const share = useShareCard(
    () => drawJourneyCard({ name, avatarUrl, logoUrl: "/icon-192.png", link, subtitle, stats }),
    [name, avatarUrl, subtitle, stats, link],
    {
      filename: "必学堂-学习足迹.png",
      shareTitle: "我的学习足迹 · 必学堂",
      copyToast: "图片已复制,粘贴即可发出",
    },
  );

  return (
    <SharePopupFrame
      onClose={onClose}
      tabs={<button className="on">学习足迹</button>}
      loadingLabel="生成足迹图…"
      imgAlt="足迹图预览"
      note="晒出你的坚持,扫码的人就来必学堂开启自学。"
      share={share}
    />
  );
}
