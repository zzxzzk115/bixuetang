import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { DashStream } from "./api";
import { buildMpd, pickVideoStreams } from "./mpd";

const proxy = (u: string) => `/api/bili/stream?u=${encodeURIComponent(u)}`;

function stream(over: Partial<DashStream>): DashStream {
  return {
    id: 80,
    baseUrl: "https://cn-gd.bilivideo.com/v.m4s?e=abc&d=1",
    backupUrls: [],
    bandwidth: 1_500_000,
    mimeType: "video/mp4",
    codecs: "avc1.640032",
    width: 1920,
    height: 1080,
    frameRate: "30000/1001",
    initRange: "0-991",
    indexRange: "992-5647",
    ...over,
  };
}

test("同一 qn 多编码只留 AVC", () => {
  const picked = pickVideoStreams([
    stream({ codecs: "hev1.1.6.L120.90" }),
    stream({ codecs: "avc1.640032" }),
    stream({ codecs: "av01.0.08M.08.0.110" }),
  ]);
  assert.equal(picked.length, 1);
  assert.ok(picked[0].codecs.startsWith("avc1"));
});

test("没有 AVC 时退而求 HEVC，并按清晰度降序", () => {
  const picked = pickVideoStreams([
    stream({ id: 64, codecs: "av01.0.08M.08" }),
    stream({ id: 64, codecs: "hev1.1.6.L120.90" }),
    stream({ id: 80, codecs: "hev1.1.6.L150.90" }),
  ]);
  assert.deepEqual(
    picked.map((s) => [s.id, s.codecs.slice(0, 4)]),
    [
      [80, "hev1"],
      [64, "hev1"],
    ],
  );
});

test("缺 segment_base 的流被剔除；全剔时返回 null", () => {
  const picked = pickVideoStreams([stream({ indexRange: undefined })]);
  assert.equal(picked.length, 0);
  assert.equal(
    buildMpd(
      { durationSec: 100, video: [stream({ initRange: undefined })], audio: [] },
      proxy,
    ),
    null,
  );
});

test("MPD 结构：区间透传、URL 转义、代理改写覆盖主备源", () => {
  const mpd = buildMpd(
    {
      durationSec: 4200,
      video: [stream({ backupUrls: ["https://upos-sz.bilivideo.com/b.m4s?x=1&y=2"] })],
      audio: [
        stream({
          id: 30280,
          mimeType: "audio/mp4",
          codecs: "mp4a.40.2",
          width: undefined,
          height: undefined,
          frameRate: undefined,
          initRange: "0-907",
          indexRange: "908-1500",
        }),
      ],
    },
    proxy,
  );
  assert.ok(mpd);
  assert.match(mpd, /mediaPresentationDuration="PT4200S"/);
  assert.match(mpd, /indexRange="992-5647"/);
  assert.match(mpd, /<Initialization range="0-991"\/>/);
  assert.match(mpd, /contentType="audio"/);
  assert.match(mpd, /codecs="mp4a\.40\.2"/);
  // 所有 BaseURL（含备源）都必须走代理，且 & 要转义成 &amp;
  const baseUrls = [...mpd.matchAll(/<BaseURL>([^<]+)<\/BaseURL>/g)].map(
    (m) => m[1],
  );
  assert.equal(baseUrls.length, 3);
  for (const u of baseUrls) {
    assert.ok(u.startsWith("/api/bili/stream?u="), u);
    assert.ok(!u.includes("&amp;amp;"), "不能双重转义");
  }
  // 原始直链的 & 在 encodeURIComponent 后不存在，但转义函数本身要能处理
  assert.ok(!mpd.includes("e=abc&d=1"), "上游直链不能裸奔出现在 MPD 里");
});

test("音频轨缺失时不输出 audio AdaptationSet", () => {
  const mpd = buildMpd(
    { durationSec: 60, video: [stream({})], audio: [] },
    proxy,
  );
  assert.ok(mpd);
  assert.ok(!mpd.includes(`contentType="audio"`));
});
