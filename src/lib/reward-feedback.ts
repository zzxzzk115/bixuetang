// 奖励反馈总线:任何结算点(手动勾选/播放器自动打卡/复习收尾)把
// ToggleResult 交给 announceSettle,统一翻译成吐司 + 全屏庆祝。
//
// 心理学依据:即时反馈(immediate feedback)——行为与奖励的间隔越短,
// 强化效果越好。之前「看完 90% 自动打卡」这条主路径只弹词条弹窗,
// XP/金币/升级全被吞掉,等于最常见的学习行为得不到任何可见回报。

import { celebrate } from "./celebrate";
import type { ToggleResult } from "./progress/actions";

export const REWARD_TOAST_EVENT = "guild:reward-toast";

export interface RewardToast {
  text: string;
  /** 高亮色调:金币橙 / 经验绿 / 连胜火 / 复习蓝 / 彩蛋紫 */
  tone?: "coin" | "xp" | "streak" | "review" | "lucky";
}

export function rewardToast(detail: RewardToast) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<RewardToast>(REWARD_TOAST_EVENT, { detail }),
  );
}

/** 把一次打卡结算翻译成完整的反馈序列 */
export function announceSettle(settle: ToggleResult) {
  if (!settle.ok) return;

  if (settle.loot) {
    rewardToast({
      text: `+${settle.loot.coins} 金币 · ${settle.loot.item.title}`,
      tone: "coin",
    });
    if (settle.loot.item.cursed) {
      rewardToast({
        text: `🩸 诅咒遗物!力量翻倍,却有代价——去背包一探`,
        tone: "lucky",
      });
    }
    if (settle.loot.luckyCoins > 0) {
      rewardToast({
        text: `🎉 幸运彩蛋 +${settle.loot.luckyCoins} 金币`,
        tone: "lucky",
      });
    }
  }
  const episodeXp = (settle.gained ?? 0) - (settle.bossBonus ?? 0);
  if (episodeXp > 0) rewardToast({ text: `+${episodeXp} XP`, tone: "xp" });
  if (settle.reviewCards && settle.reviewCards > 0) {
    rewardToast({
      text: `${settle.reviewCards} 张复习卡已入队 · 明天见`,
      tone: "review",
    });
  }
  if (settle.streakChanged && settle.streak && settle.streak > 1) {
    rewardToast({ text: `🔥 连续学习 ${settle.streak} 天`, tone: "streak" });
  }
  if (settle.usedFreeze) {
    rewardToast({ text: `❄️ 连胜冻结生效,连胜保住了`, tone: "streak" });
  }
  if (settle.shieldDropped) {
    rewardToast({ text: `🛡️ 掉落护盾血 · 试炼里替你挡一次`, tone: "lucky" });
  }

  if (settle.bossBonus && settle.bossBonus > 0) {
    celebrate({
      kind: "boss",
      title: "课程通关！",
      subtitle: `全集完成奖励 +${settle.bossBonus} XP`,
    });
  }
  if (settle.levelUp) {
    celebrate({
      kind: "level",
      title: `升至 Lv.${settle.newLevel}`,
      subtitle: "继续保持",
    });
  }
}
