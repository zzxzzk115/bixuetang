import {
  Award,
  Crown,
  Diamond,
  Gem,
  Hexagon,
  Medal,
  Shield,
  Star,
} from "lucide-react";

// 段位专属图标(纯展示,server/client 都能用)。图标键见 lib/game/league.ts 的 LEAGUE_TIERS.icon:
// 盾牌→奖牌→宝石→皇冠,随段位升高递进。配色由外层用 --app-* 变量控制。
export function TierIcon({ icon, size = 24 }: { icon: string; size?: number }) {
  if (icon === "hexagon") return <Hexagon size={size} aria-hidden />;
  if (icon === "award") return <Award size={size} aria-hidden />;
  if (icon === "medal") return <Medal size={size} aria-hidden />;
  if (icon === "gem") return <Gem size={size} aria-hidden />;
  if (icon === "diamond") return <Diamond size={size} aria-hidden />;
  if (icon === "star") return <Star size={size} aria-hidden />;
  if (icon === "crown") return <Crown size={size} aria-hidden />;
  return <Shield size={size} aria-hidden />;
}
