import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IRON_INDEX,
  KING_INDEX,
  LEAGUE_TIERS,
  settleTier,
  tierByIndex,
  tierByKey,
  tierIndex,
  weekIndex,
  weekRange,
  zoneCounts,
  type LeagueMember,
} from "./league";

const m = (userId: number, weekXp: number): LeagueMember => ({ userId, weekXp });

describe("段位表", () => {
  it("青铜起步、黑铁兜底、王者封顶", () => {
    assert.equal(tierIndex("bronze"), 1);
    assert.equal(LEAGUE_TIERS[IRON_INDEX].key, "iron");
    assert.equal(LEAGUE_TIERS[KING_INDEX].key, "king");
    assert.equal(tierByKey("gold").label, "黄金");
    // 越界 clamp
    assert.equal(tierByIndex(-3).key, "iron");
    assert.equal(tierByIndex(99).key, "king");
    // 未知 key 回退青铜
    assert.equal(tierIndex("???"), 1);
  });
});

describe("周界(北京时间周一)", () => {
  it("同一周内起止相差 7 天，跨周 +1", () => {
    // 2026-08-10 是周一(北京时间)
    const monday = Date.UTC(2026, 7, 10) - 8 * 3600 * 1000; // 北京周一 00:00
    const wi = weekIndex(monday);
    const { start, end } = weekRange(wi);
    assert.equal(start, monday);
    assert.equal(end - start, 7 * 24 * 3600 * 1000);
    // 周日深夜仍是同一周,下周一进入下一周
    assert.equal(weekIndex(monday + 6 * 24 * 3600 * 1000 + 3600 * 1000), wi);
    assert.equal(weekIndex(monday + 7 * 24 * 3600 * 1000), wi + 1);
    assert.equal(weekIndex(monday - 1), wi - 1);
  });
});

describe("zoneCounts 升降名额", () => {
  it("满联赛(30人)升7降5", () => {
    assert.deepEqual(zoneCounts(3, 30), { promote: 7, demote: 5 });
  });
  it("顶段不升、底段不降", () => {
    assert.equal(zoneCounts(KING_INDEX, 30).promote, 0);
    assert.equal(zoneCounts(IRON_INDEX, 30).demote, 0);
  });
  it("小组按比例缩放且不重叠", () => {
    const z = zoneCounts(3, 4);
    assert.ok(z.promote >= 1);
    assert.ok(z.promote + z.demote < 4); // 至少留 1 个原地缓冲
  });
  it("人太少(<5)不降级,单人不升", () => {
    assert.equal(zoneCounts(3, 4).demote, 0);
    assert.equal(zoneCounts(3, 1).promote, 0);
  });
});

describe("settleTier 结算", () => {
  it("顶部晋级、底部降级、中间原地", () => {
    // 30 人,经验 = 30..1,tier=3(黄金)
    const members = Array.from({ length: 30 }, (_, i) => m(i + 1, 30 - i));
    const out = settleTier(3, members);
    const byUser = new Map(out.map((o) => [o.userId, o]));
    // 前 7 名晋级到 4
    assert.equal(byUser.get(1)!.result, "promote");
    assert.equal(byUser.get(7)!.result, "promote");
    assert.equal(byUser.get(8)!.result, "stay");
    // 末 5 名降级到 2
    assert.equal(byUser.get(30)!.result, "demote");
    assert.equal(byUser.get(26)!.result, "demote");
    assert.equal(byUser.get(1)!.toTier, 4);
    assert.equal(byUser.get(30)!.toTier, 2);
  });
  it("0 经验(不活跃)一律原地,不被降级", () => {
    const members = [m(1, 100), m(2, 0), m(3, 0)];
    const out = settleTier(5, members);
    const byUser = new Map(out.map((o) => [o.userId, o]));
    assert.equal(byUser.get(2)!.result, "stay");
    assert.equal(byUser.get(3)!.result, "stay");
    assert.equal(out.length, 3);
  });
  it("每个成员恰好一条结算", () => {
    const members = Array.from({ length: 12 }, (_, i) => m(i + 1, (i * 37) % 100));
    const out = settleTier(2, members);
    assert.equal(out.length, 12);
    assert.equal(new Set(out.map((o) => o.userId)).size, 12);
  });
});
