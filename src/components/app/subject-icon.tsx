import {
  Atom,
  Brain,
  Cpu,
  Feather,
  Landmark,
  Languages,
  Map as MapIcon,
  Microscope,
  Scale,
  Sigma,
  Sparkles,
} from "lucide-react";

// 学科图标单一出处(此前 app-shell 的 SubjectIcon 与 onboarding 的 SubjectGlyph 各写一份,
// 图标映射完全一致,只差 size 与兜底图标)。纯展示,server/client 都能用。
export function SubjectIcon({
  subject,
  size = 17,
  fallback = "map",
}: {
  subject?: string;
  size?: number;
  /** 未知学科的兜底图标:地图(壳内)或星星(引导页) */
  fallback?: "map" | "sparkles";
}) {
  if (subject === "math") return <Sigma size={size} aria-hidden />;
  if (subject === "physics") return <Atom size={size} aria-hidden />;
  if (subject === "ai") return <Brain size={size} aria-hidden />;
  if (subject === "cs") return <Cpu size={size} aria-hidden />;
  if (subject === "en") return <Languages size={size} aria-hidden />;
  if (subject === "ja") return <Feather size={size} aria-hidden />;
  if (subject === "history") return <Landmark size={size} aria-hidden />;
  if (subject === "research") return <Microscope size={size} aria-hidden />;
  if (subject === "politics") return <Scale size={size} aria-hidden />;
  return fallback === "sparkles" ? (
    <Sparkles size={size} aria-hidden />
  ) : (
    <MapIcon size={size} aria-hidden />
  );
}
