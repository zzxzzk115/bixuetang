import type { Roadmap } from "../content/schema";

// 首进引导「成为 X」职业目标卡所需的轻量数据(纯函数,client 可用)。
// 不把整份 roadmap(含各阶段课程)塞进客户端,只给卡片要展示/定位的字段。

export interface RoadmapChoice {
  id: string;
  title: string;
  tagline: string;
  /** 图标键,前端映射到 lucide 图标 */
  icon: string;
  /** 首门课 id:选完在地图上定位到含它的那条路线的第一关 */
  firstCourseId: string;
}

const ICON: Record<string, string> = {
  "ai-engineer": "brain",
  "fullstack-dev": "globe",
  "data-scientist": "chart",
  "game-dev": "gamepad",
  "security-engineer": "shield",
  "backend-engineer": "server",
};

/** roadmap id → CareerGlyph 图标键(供卡片/关系条直接取图标) */
export function roadmapIcon(id: string): string {
  return ICON[id] ?? "sparkles";
}

export function roadmapChoices(roadmaps: Roadmap[]): RoadmapChoice[] {
  return roadmaps.map((r) => ({
    id: r.id,
    title: r.title,
    tagline: r.tagline ?? "",
    icon: roadmapIcon(r.id),
    firstCourseId: r.stages[0]?.courses[0] ?? "",
  }));
}
