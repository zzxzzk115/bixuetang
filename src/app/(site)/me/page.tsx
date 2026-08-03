import Link from "next/link";
import { Award, Coins, Crosshair, Eye, Flame, Shield, Sparkles, Timer } from "lucide-react";
import { StatusBadge, SubjectIcon } from "@/components/badges";
import { XpBar } from "@/components/xp-bar";
import { requireUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { SUBJECT_LABEL, SUBJECTS } from "@/lib/content/schema";
import { skillPointsEarned } from "@/lib/game/level";
import { learningStreak, syncAchievements } from "@/lib/game/achievements";
import { getRpgProfile } from "@/lib/game/rpg-server";
import { spentPoints } from "@/lib/game/skills";
import { getHeldJobs, getSubjectXp, getUserProgress, getXpLog } from "@/lib/progress/queries";

export const metadata = { title: "角色档案" };

export default async function MePage() {
  const user = await requireUser();
  const content = getContent();
  const progress = getUserProgress(user.id);
  const subjectXp = getSubjectXp(progress);
  const xpLog = getXpLog(user.id, 20);
  const maxSubjectXp = Math.max(1, ...Object.values(subjectXp));
  const points = skillPointsEarned(progress.level.level) - spentPoints(content.skillNodes, progress.litSkills);
  const held = getHeldJobs(user.id);
  const heldJobs = content.jobs.filter((job) => held.has(job.id));
  const activeTitle =
    content.jobById.get(user.activeJobId ?? "")?.title ??
    heldJobs.find((job) => job.tier === 0)?.title ??
    "见习学者";
  const displayName = user.displayName || user.username;
  const achievements = syncAchievements(user.id);
  const streak = learningStreak(user.id);
  const rpg = getRpgProfile(user.id);
  const activeCourses = [...progress.statusByCourse.entries()]
    .filter(([, status]) => status === "learning" || status === "done")
    .map(([id, status]) => ({ course: content.coursesById.get(id), status }))
    .filter((entry) => entry.course !== undefined);

  return (
    <div className="page-stack mx-auto max-w-6xl">
      <header className="page-intro">
        <div>
          <p className="page-kicker">ADVENTURER DOSSIER // 角色状态</p>
          <h1 className="page-title">角色档案</h1>
          <p className="page-lead">追踪等级、职业构筑、学科修为与正在攻略的副本。</p>
        </div>
        <div className="hero-stat">
          <span className="hero-stat-value">Lv.{progress.level.level}</span>
          <span className="hero-stat-label">{activeTitle}</span>
        </div>
      </header>

      <div className="profile-layout">
        <aside className="space-y-4">
          <section className="hud-panel p-5">
            <div className="flex items-center gap-4">
              <div className="profile-sigil">{displayName.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0">
                <p className="page-kicker">ACTIVE SCHOLAR</p>
                <h2 className="truncate text-lg font-black">{displayName}</h2>
                <p className="text-xs font-bold text-gold">{activeTitle}</p>
              </div>
            </div>
            <div className="mt-5"><XpBar level={progress.level} /></div>
            <div className="profile-stats">
              <div><strong>{progress.totalXp}</strong><span>总经验</span></div>
              <div><strong>{points}</strong><span>技能点</span></div>
              <div><strong>{streak}</strong><span>连续天数</span></div>
            </div>
          </section>

          <section className="hud-panel rpg-character-sheet p-5">
            <div className="section-heading compact">
              <div><p className="page-kicker">MIRRORED ATTRIBUTES</p><h2>冒险者属性</h2></div>
              <span className="rpg-power-mark">战力 {rpg.stats.power}</span>
            </div>
            <div className="rpg-attribute-grid">
              <div><Eye aria-hidden size={15} /><span>洞察</span><b>{rpg.stats.insight}</b></div>
              <div><Timer aria-hidden size={15} /><span>专注</span><b>{rpg.stats.focus}</b></div>
              <div><Crosshair aria-hidden size={15} /><span>精准</span><b>{rpg.stats.precision}</b></div>
              <div><Shield aria-hidden size={15} /><span>意志</span><b>{rpg.stats.resolve}</b></div>
            </div>
            <div className="rpg-wallet"><Coins aria-hidden size={15} /><span>公会金币</span><b>{rpg.coins}</b></div>
            <p className="rpg-sheet-note">属性只由已记录的学习、专注、复述与技能进度推导。</p>
          </section>

          <section className="hud-panel rpg-inventory p-5">
            <div className="section-heading compact">
              <div><p className="page-kicker">RELIC VAULT</p><h2>遗物背包</h2></div>
              <Sparkles aria-hidden size={16} />
            </div>
            {rpg.relics.length === 0 ? (
              <p className="text-xs text-muted">完成任意分集后，固定学科材料会在此归档。</p>
            ) : (
              <ul className="rpg-inventory-list">
                {rpg.relics.map(({ item, quantity }) => (
                  <li key={item.id} data-rarity={item.rarity}>
                    <span className="rpg-item-glyph">{item.title.slice(0, 1)}</span>
                    <span><b>{item.title}</b><small>{item.description}</small></span>
                    <strong>×{quantity}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="hud-panel p-5">
            <div className="section-heading compact">
              <div><p className="page-kicker">CLASS CRESTS</p><h2>职业徽章</h2></div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {heldJobs.map((job) => (
                <span key={job.id} className={`job-crest ${(user.activeJobId ?? heldJobs[0]?.id) === job.id ? "active" : ""}`}>
                  T{job.tier} · {job.title}
                </span>
              ))}
            </div>
            <Link href="/jobs" className="mt-4 inline-block font-mono text-[12px] font-bold text-gold">前往转职殿堂 →</Link>
          </section>

          <section className="hud-panel p-5">
            <div className="section-heading compact">
              <div><p className="page-kicker">DISCIPLINES</p><h2>四维修为</h2></div>
            </div>
            <div className="space-y-3">
              {SUBJECTS.map((subject) => (
                <div key={subject}>
                  <div className="flex justify-between text-xs">
                    <span className="font-bold"><SubjectIcon subject={subject} /> {SUBJECT_LABEL[subject]}</span>
                    <span className="font-mono text-muted">{subjectXp[subject]} XP</span>
                  </div>
                  <div className="progress-track mt-1.5">
                    <div className="progress-fill" style={{ width: `${(subjectXp[subject] / maxSubjectXp) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <div className="space-y-8">
          <section>
            <div className="section-heading">
              <div><p className="page-kicker">ACTIVE DUNGEONS</p><h2>我的副本</h2></div>
              <Link href="/courses" className="font-mono text-[12px] font-bold text-gold">副本档案 →</Link>
            </div>
            {activeCourses.length === 0 ? (
              <div className="hud-panel py-10 text-center text-sm text-muted">尚未部署任何副本远征。</div>
            ) : (
              <div className="dungeon-grid">
                {activeCourses.map(({ course, status }) => {
                  const item = course!;
                  const watched = progress.watchedByCourse.get(item.id)?.size ?? 0;
                  const percent = Math.round((watched / item.episodes.length) * 100);
                  return (
                    <Link key={item.id} href={`/courses/${item.id}`} className="dungeon-card">
                      <div className="dungeon-card-topline"><span>{item.code}</span><StatusBadge status={status} /></div>
                      <h3 className="dungeon-title">{item.title}</h3>
                      <div className="mt-auto pt-5">
                        <div className="mb-1.5 flex justify-between font-mono text-[11px] text-muted">
                          <span>{watched} / {item.episodes.length} ENCOUNTERS</span><span>{percent}%</span>
                        </div>
                        <div className="progress-track"><div className={`progress-fill ${percent >= 100 ? "gold" : "hp"}`} style={{ width: `${percent}%` }} /></div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="section-heading">
              <div><p className="page-kicker">ACHIEVEMENT VAULT</p><h2>公会成就</h2></div>
              <span className="guild-streak"><Flame aria-hidden size={14} /> {streak} DAYS</span>
            </div>
            <div className="achievement-strip">
              {achievements.map((achievement) => (
                <div key={achievement.id} className={`achievement-token ${achievement.unlocked ? "unlocked" : ""}`}>
                  <Award aria-hidden size={18} />
                  <span><b>{achievement.title}</b><small>{achievement.description}</small></span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="section-heading">
              <div><p className="page-kicker">COMBAT LOG</p><h2>冒险日志</h2></div>
            </div>
            {xpLog.length === 0 ? (
              <div className="hud-panel py-10 text-center text-sm text-muted">战斗日志尚无记录。</div>
            ) : (
              <ul className="quest-board">
                {xpLog.map((entry, index) => (
                  <li key={index} className="quest-row">
                    <span className="quest-number">{String(index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <p className="font-bold">{entry.label}</p>
                      <p className="font-mono text-[11px] text-muted">{entry.reason.toUpperCase()}</p>
                    </div>
                    <strong className="text-xp">+{entry.amount} XP</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
