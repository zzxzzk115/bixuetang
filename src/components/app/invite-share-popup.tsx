"use client";

import { drawInviteCard } from "@/lib/share-card";
import { SharePopupFrame, useShareCard } from "./share-frame";

// 邀请分享图弹层:生成带二维码的邀请图(drawInviteCard),复用共享的分享壳与图片处理。

export function InviteSharePopup({
  onClose,
  inviterName,
  avatarUrl,
  link,
}: {
  onClose: () => void;
  inviterName: string;
  avatarUrl: string | null;
  link: string;
}) {
  const share = useShareCard(
    () => drawInviteCard({ inviterName, avatarUrl, logoUrl: "/icon-192.png", link }),
    [inviterName, avatarUrl, link],
    {
      filename: "必学堂-邀请.png",
      shareTitle: "必学堂 · 邀请你一起学",
      copyToast: "图片已复制,聊天窗口里粘贴即可",
      saveToast: "已保存,发给好友即可",
    },
  );

  return (
    <SharePopupFrame
      onClose={onClose}
      tabs={<button className="on">邀请好友</button>}
      loadingLabel="生成邀请图…"
      imgAlt="邀请图预览"
      note="扫码即注册成为你的好友;TA 完成新手引导后,你得 +50 XP、+100 金币。"
      share={share}
    />
  );
}
