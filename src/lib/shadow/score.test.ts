import assert from "node:assert/strict";
import test from "node:test";
import { dtw, scoreShadow } from "./score";

const SR = 16000;

/** 合成一个带轻微谐波的正弦(近似「有音高的语音」) */
function tone(freq: number, dur: number, sr = SR): Float32Array {
  const n = Math.floor(sr * dur);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    a[i] =
      0.5 * Math.sin(2 * Math.PI * freq * t) +
      0.2 * Math.sin(2 * Math.PI * 2 * freq * t);
  }
  return a;
}

test("DTW:相同序列距离为 0,不同序列距离更大", () => {
  const A = [[0], [1], [2], [3]];
  const B = [[0], [1], [2], [3]];
  const C = [[3], [2], [1], [0]];
  assert.equal(dtw(A, B), 0);
  assert.ok(dtw(A, C) > dtw(A, B));
});

test("同一段音频跟读匹配分接近满分", () => {
  const a = tone(200, 1.2);
  const s = scoreShadow(a, a.slice(), SR);
  assert.ok(s.overall >= 90, `identical overall=${s.overall}`);
  assert.ok(s.phonetic >= 90 && s.intonation >= 90);
});

test("音高/音色差很多时分数明显更低", () => {
  const orig = tone(200, 1.2);
  const same = scoreShadow(orig, orig.slice(), SR).overall;
  const diff = scoreShadow(orig, tone(480, 1.2), SR).overall;
  assert.ok(diff < same, `diff=${diff} 应低于 same=${same}`);
});

test("语速不同(时长拉伸)仍能对齐,不至于崩到 0", () => {
  // DTW 的价值:同样内容说快说慢也能对齐
  const s = scoreShadow(tone(200, 1.5), tone(200, 1.0), SR);
  assert.ok(s.overall > 50, `变速后 overall=${s.overall} 应仍较高`);
});
