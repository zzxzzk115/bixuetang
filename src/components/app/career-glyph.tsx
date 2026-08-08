import {
  BarChart3,
  Brain,
  Gamepad2,
  Globe,
  Server,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

// 「成为 X」职业路线的图标与配色,首进引导与老用户补弹提示共用。

export const ROADMAP_TONE: Record<string, string> = {
  "ai-engineer": "var(--app-green)",
  "fullstack-dev": "var(--app-blue)",
  "data-scientist": "var(--app-teal)",
  "game-dev": "var(--app-pink)",
  "security-engineer": "var(--app-orange)",
  "backend-engineer": "var(--app-brown)",
};

export function CareerGlyph({ icon, size = 26 }: { icon: string; size?: number }) {
  if (icon === "brain") return <Brain size={size} aria-hidden />;
  if (icon === "globe") return <Globe size={size} aria-hidden />;
  if (icon === "chart") return <BarChart3 size={size} aria-hidden />;
  if (icon === "gamepad") return <Gamepad2 size={size} aria-hidden />;
  if (icon === "shield") return <ShieldCheck size={size} aria-hidden />;
  if (icon === "server") return <Server size={size} aria-hidden />;
  return <Sparkles size={size} aria-hidden />;
}
