import assert from "node:assert/strict";
import { test } from "node:test";
import { sniffImage } from "./storage";
import { avatarSrc, parseAvatar, SIGIL_SRC } from "./presets";

const png = () =>
  Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const webp = () =>
  Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);

test("认得 png / jpeg / webp 的文件头", () => {
  assert.equal(sniffImage(png()), "image/png");
  assert.equal(sniffImage(jpeg()), "image/jpeg");
  assert.equal(sniffImage(webp()), "image/webp");
});

test("非图片一律拒绝", () => {
  // SVG——能带 <script>，绝不能当头像存下来再原样发回去
  assert.equal(sniffImage(new TextEncoder().encode("<svg xmlns=")), null);
  // HTML
  assert.equal(sniffImage(new TextEncoder().encode("<!DOCTYPE html>")), null);
  // ELF 可执行文件
  assert.equal(sniffImage(Uint8Array.from([0x7f, 0x45, 0x4c, 0x46])), null);
  // 空内容与过短内容
  assert.equal(sniffImage(new Uint8Array()), null);
  assert.equal(sniffImage(Uint8Array.from([0x89, 0x50])), null);
});

test("RIFF 但不是 WEBP 的（比如 wav）要拒绝", () => {
  const wav = Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
  ]);
  assert.equal(sniffImage(wav), null);
});

test("parseAvatar 解析各种取值", () => {
  assert.deepEqual(parseAvatar(null), { kind: "none" });
  assert.deepEqual(parseAvatar(""), { kind: "none" });
  assert.deepEqual(parseAvatar("upload:7"), { kind: "upload", version: "7" });
  assert.deepEqual(parseAvatar("bili:https://i0.hdslb.com/x.jpg"), {
    kind: "remote",
    url: "https://i0.hdslb.com/x.jpg",
  });
  // 非 bilibili 图床的地址不放行，避免变成任意图片代理
  assert.deepEqual(parseAvatar("bili:https://evil.example/x.jpg"), {
    kind: "none",
  });
  // 退役的预设头像与无法识别的值一律当作未设置
  assert.deepEqual(parseAvatar("preset:sage"), { kind: "none" });
  assert.deepEqual(parseAvatar("garbage"), { kind: "none" });
});

test("avatarSrc：上传态带版本号破缓存", () => {
  assert.equal(avatarSrc("upload:3", 42), "/avatars/42?v=3");
  // 退役的 preset:* 老数据认不出来，退化成站点徽记
  assert.equal(avatarSrc("preset:sage", 42), SIGIL_SRC);
  // 没设置过头像就用站点徽记兜底，不再回落到首字母色块
  assert.equal(avatarSrc(null, 42), SIGIL_SRC);
});
