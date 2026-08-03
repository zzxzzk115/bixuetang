import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  Coins,
  FlaskConical,
  Library,
  Map,
  Orbit,
  ScrollText,
  Shield,
  Swords,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DailyQuestBoard } from "@/components/daily-quest-board";
import { GuildSigil } from "@/components/guild-sigil";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { learningStreak, syncAchievements } from "@/lib/game/achievements";
import { getDailyQuests } from "@/lib/game/quests";
import { ENCOUNTER_LABEL, lootForEpisode } from "@/lib/game/rpg";
import { getUserProgress } from "@/lib/progress/queries";

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
  const locations: SceneLocation[] = [
    { href: "/courses", code: "ARCHIVE", title: "副本档案馆", detail: `${content.courses.length} 座知识副本`, zone: "archive", icon: Library },
    { href: "/jobs", code: "CLASS HALL", title: "转职殿堂", detail: `${content.jobs.length} 条职业道路`, zone: "jobs", icon: Shield },
    { href: "/paths", code: "WAR TABLE", title: "远征沙盘", detail: `${content.paths.length} 条冒险路线`, zone: "paths", icon: Map },
    { href: "/lab", code: "WORKSHOP", title: "实验工坊", detail: "Hack · 数学演算", zone: "lab", icon: FlaskConical },
    { href: "/skill-tree", code: "ASTROLABE", title: "技能星盘", detail: `${content.skillNodes.length} 个可唤醒节点`, zone: "skills", icon: Orbit },
    { href: "/glossary", code: "LEXICON", title: "知识卷宗", detail: "中英术语与公式", zone: "glossary", icon: BookOpenText },
  ];

  if (!user) {
    return (
      <GuildScene locations={locations} name="旅行者">
        <section className="scene-entry-panel">
          <p className="scene-panel-kicker">NEW ADVENTURER</p>
          <h1>你的理科学术冒险，从公会登记开始</h1>
          <p>选择据点查看真实课程、技能树与实验设施。建立角色后，遭遇、专注、复盘和 Boss 战都会转化为经验与职业进度。</p>
          <div className="scene-panel-actions">
            <Link href="/register" className="scene-primary-action">建立角色 <ArrowRight aria-hidden size={16} /></Link>
            <Link href="/paths" className="scene-secondary-action">先查看远征地图</Link>
          </div>
        </section>
      </GuildScene>
    );
  }

  const progress = getUserProgress(user.id);
  const quests = getDailyQuests(user.id);
  const achievements = syncAchievements(user.id);
  const streak = learningStreak(user.id);
  const activeCourse =
    [...progress.statusByCourse.entries()]
      .filter(([, status]) => status === "learning")
      .map(([id]) => content.coursesById.get(id))
      .find(Boolean) ??
    content.coursesById.get(quests[0]?.courseId ?? "");
  const watched = activeCourse
    ? progress.watchedByCourse.get(activeCourse.id) ?? new Set<number>()
    : new Set<number>();
  const nextEpisode = activeCourse?.episodes.find((episode) => !watched.has(episode.n));
  const percent = activeCourse
    ? Math.round((watched.size / activeCourse.episodes.length) * 100)
    : 0;
  const activeLoot = activeCourse && nextEpisode
    ? lootForEpisode(activeCourse.subject, activeCourse.level, nextEpisode.n, activeCourse.episodes.length)
    : null;
  const activePath = activeCourse
    ? content.paths.find((path) => path.stages.some((stage) => stage.courses.includes(activeCourse.id)))
    : undefined;
  const unlockedAchievements = achievements.filter((item) => item.unlocked).length;

  return (
    <GuildScene
      locations={locations}
      name={user.displayName || user.username}
      status={`连续远征 ${streak} 天 · ${unlockedAchievements} 枚成就`}
    >
      <aside className="scene-orders-panel">
        <div className="scene-panel-heading">
          <span><ScrollText aria-hidden size={15} /> 每日委托</span>
          <b>{quests.filter((quest) => quest.complete).length}/{quests.length}</b>
        </div>
        <DailyQuestBoard quests={quests} compact />
      </aside>

      <section className="scene-expedition-panel">
        <div className="scene-panel-heading">
          <span><Swords aria-hidden size={15} /> 当前战役</span>
          {activePath && <Link href={`/paths/${activePath.id}`}>{activePath.title}</Link>}
        </div>
        {activeCourse && nextEpisode ? (
          <>
            <div className="scene-battle-target">
              <span className="scene-battle-rank">{activeLoot ? ENCOUNTER_LABEL[activeLoot.encounterType] : "READY"}</span>
              <div>
                <small>{activeCourse.code}</small>
                <h2>{activeCourse.title}</h2>
                <p>下一遭遇 · EP.{String(nextEpisode.n).padStart(2, "0")} {nextEpisode.title}</p>
                {activeLoot && <span className="scene-loot-preview"><Coins aria-hidden size={12} /> {activeLoot.coins} · {activeLoot.item.title}</span>}
              </div>
            </div>
            <div className="scene-boss-health">
              <span><b>BOSS HP</b><small>{100 - percent}%</small></span>
              <div><i style={{ width: `${Math.max(0, 100 - percent)}%` }} /></div>
            </div>
            <Link href={`/courses/${activeCourse.id}`} className="scene-deploy">
              进入下一场遭遇 <ArrowRight aria-hidden size={16} />
            </Link>
          </>
        ) : (
          <div className="scene-empty-target">
            <p>目前没有部署中的远征。</p>
            <Link href="/paths" className="scene-primary-action">选择战役</Link>
          </div>
        )}
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
