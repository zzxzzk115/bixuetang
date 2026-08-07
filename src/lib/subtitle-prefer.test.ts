import assert from "node:assert/strict";
import test from "node:test";
import {
  coveredSeconds,
  dropOutclassedEnglish,
  isEnglishLan,
} from "./subtitle-prefer";

const cue = (from: number, to: number) => ({ from, to, text: "x" });
const track = (
  lan: string,
  cues: { from: number; to: number; text: string }[],
  opts: { ai?: boolean; suspect?: boolean } = {},
) => ({ lan, cues, ai: opts.ai ?? false, suspect: opts.suspect ?? false });

test("isEnglishLan 认得 bilibili 与仓库两种命名", () => {
  assert.ok(isEnglishLan("en-US"));
  assert.ok(isEnglishLan("yt-en"));
  assert.ok(isEnglishLan("yt-en-auto"));
  assert.ok(!isEnglishLan("zh-CN"));
  assert.ok(!isEnglishLan("ai-zh"));
});

test("coveredSeconds 求 cue 区间总和", () => {
  assert.equal(coveredSeconds([cue(0, 10), cue(20, 25)]), 15);
  assert.equal(coveredSeconds([]), 0);
});

test("仓库轨明显更完整时剔除 bilibili 英文轨", () => {
  const bili = [track("zh-CN", [cue(0, 100)]), track("en-US", [cue(0, 100)])];
  const repo = track("yt-en", [cue(0, 300)]);
  const kept = dropOutclassedEnglish(bili, repo);
  assert.deepEqual(
    kept.map((t) => t.lan),
    ["zh-CN"],
  );
});

test("完整度接近(未超阈值)时保留 bilibili 英文轨", () => {
  const bili = [track("en-US", [cue(0, 290)])];
  const repo = track("yt-en", [cue(0, 300)]);
  assert.equal(dropOutclassedEnglish(bili, repo).length, 1);
});

test("bilibili 英文轨是 AI 而仓库是人工 CC → 无条件替换", () => {
  const bili = [track("en-US", [cue(0, 300)], { ai: true })];
  const repo = track("yt-en", [cue(0, 100)]);
  assert.equal(dropOutclassedEnglish(bili, repo).length, 0);
});

test("仓库轨也是自动轨时不享受无条件替换", () => {
  const bili = [track("en-US", [cue(0, 300)], { ai: true })];
  const repo = track("yt-en-auto", [cue(0, 100)], { ai: true });
  assert.equal(dropOutclassedEnglish(bili, repo).length, 1);
});

test("没有仓库轨或仓库轨为空时原样返回", () => {
  const bili = [track("en-US", [cue(0, 10)])];
  assert.equal(dropOutclassedEnglish(bili, null).length, 1);
  assert.equal(
    dropOutclassedEnglish(bili, track("yt-en", [])).length,
    1,
  );
});

test("中文轨永不受影响", () => {
  const bili = [track("ai-zh", [cue(0, 10)], { ai: true })];
  const repo = track("yt-en", [cue(0, 9999)]);
  assert.equal(dropOutclassedEnglish(bili, repo).length, 1);
});
