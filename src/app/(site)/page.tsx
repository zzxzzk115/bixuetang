import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  FlaskConical,
  Library,
  Map,
  Orbit,
  Shield,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { GuildSigil } from "@/components/guild-sigil";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";

interface SceneLocation {
  href: string;
  code: string;
  title: string;
  detail: string;
  zone: string;
  icon: LucideIcon;
}

/**
 * 据点在地图上的位置（百分比）。
 * 放在这里而不是 CSS 里，是因为连接中心与据点的路径线要用同一组坐标——
 * 分散在两处早晚会对不上。
 */
const HUB = { x: 51, y: 46 };
const ZONE_POS: Record<string, { x: number; y: number }> = {
  archive: { x: 31, y: 25 },
  jobs: { x: 56, y: 21 },
  paths: { x: 68, y: 38 },
  lab: { x: 67, y: 63 },
  skills: { x: 49, y: 66 },
  glossary: { x: 30, y: 52 },
};

export default async function HomePage() {
  const content = getContent();
  const user = await getCurrentUser();
  // 登录用户直接进全屏游戏；未登录留在这张伪 Phaser 大厅当宣传页
  if (user) redirect("/play");
  const locations: SceneLocation[] = [
    { href: "/courses", code: "ARCHIVE", title: "副本档案馆", detail: `${content.courses.length} 座知识副本`, zone: "archive", icon: Library },
    { href: "/jobs", code: "CLASS HALL", title: "转职殿堂", detail: `${content.jobs.length} 条职业道路`, zone: "jobs", icon: Shield },
    { href: "/paths", code: "WAR TABLE", title: "远征沙盘", detail: `${content.paths.length} 条冒险路线`, zone: "paths", icon: Map },
    { href: "/lab", code: "WORKSHOP", title: "实验工坊", detail: "Hack · 数学演算", zone: "lab", icon: FlaskConical },
    { href: "/skill-tree", code: "ASTROLABE", title: "技能星盘", detail: `${content.skillNodes.length} 个可唤醒节点`, zone: "skills", icon: Orbit },
    { href: "/glossary", code: "LEXICON", title: "知识卷宗", detail: "中英术语与公式", zone: "glossary", icon: BookOpenText },
  ];

  // 登录用户已在上面 redirect 到 /play，这里只剩未登录宣传页。
  return (
    <GuildScene locations={locations} name="旅行者">
      <section className="scene-entry-panel">
        <p className="scene-panel-kicker">NEW ADVENTURER</p>
        <h1>你的理科学术冒险，从公会登记开始</h1>
        <p>建立角色后登录，即可进入全屏公会大厅——走动、探索据点、挑战试炼、爬塔通关。遭遇、专注、复盘都会转化为经验与职业进度。</p>
        <div className="scene-panel-actions">
          <Link href="/register" className="scene-primary-action">建立角色 <ArrowRight aria-hidden size={16} /></Link>
          <Link href="/login" className="scene-secondary-action">已有角色，登录</Link>
        </div>
      </section>
    </GuildScene>
  );
}

function GuildScene({
  locations,
  name,
  status,
  children,
}: {
  locations: SceneLocation[];
  name: string;
  status?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="guild-hall-scene">
      <div className="scene-atmosphere" aria-hidden />
      <header className="scene-identity">
        <p>SCHOLAR GUILD</p>
        <h1>学者公会</h1>
        <span>{name}，欢迎归队{status ? ` · ${status}` : ""}</span>
      </header>

      <div className="scene-locations" aria-label="公会据点">
        {/* 从公会中心通往各据点的路线。preserveAspectRatio=none 让 viewBox 的
            0-100 直接当百分比用，和据点的定位共用同一套坐标系。 */}
        <svg
          className="scene-routes"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {locations.map((location) => {
            const p = ZONE_POS[location.zone];
            if (!p) return null;
            // 中点往外顶一点，让路线是弧线而不是直线，更像手绘地图
            const mx = (HUB.x + p.x) / 2 + (p.y - HUB.y) * 0.12;
            const my = (HUB.y + p.y) / 2 - (p.x - HUB.x) * 0.12;
            return (
              <path
                key={location.zone}
                d={`M ${HUB.x} ${HUB.y} Q ${mx} ${my} ${p.x} ${p.y}`}
                className="scene-route"
              />
            );
          })}
        </svg>
        {locations.map((location) => {
          const Icon = location.icon;
          const p = ZONE_POS[location.zone];
          return (
            <Link
              key={location.href}
              href={location.href}
              className="scene-location"
              data-zone={location.zone}
              style={p ? { left: `${p.x}%`, top: `${p.y}%` } : undefined}
            >
              <span className="scene-location-pulse" />
              <span className="scene-location-icon"><Icon aria-hidden size={21} /></span>
              <span className="scene-location-copy">
                <small>{location.code}</small>
                <b>{location.title}</b>
                <em>{location.detail}</em>
              </span>
            </Link>
          );
        })}
        <div
          className="scene-you-are-here"
          style={{ left: `${HUB.x}%`, top: `${HUB.y}%` }}
        >
          <span><GuildSigil size={34} /></span>
          <small>YOU ARE HERE</small>
        </div>
      </div>
      {children}
    </div>
  );
}
