import { test } from "node:test";
import assert from "node:assert/strict";
import { containsSensitive, firstSensitiveHit } from "./filter";

test("干净文本不误伤", () => {
  assert.equal(containsSensitive("我想成为一名 AI 工程师"), false);
  assert.equal(containsSensitive("线性代数的本质很有意思"), false);
});

test("命中辱骂词", () => {
  assert.equal(containsSensitive("你就是个傻逼"), true);
});

test("插空/分隔符规避也能挡", () => {
  assert.equal(containsSensitive("加 微 信 xxx"), true);
  assert.equal(containsSensitive("加-微-信"), true);
});

test("全角/大小写规避也能挡", () => {
  assert.equal(containsSensitive("ＳＢ"), true);
});

test("firstSensitiveHit 命中返回词、干净返回 null", () => {
  assert.ok(firstSensitiveHit("私聊我代练") !== null);
  assert.equal(firstSensitiveHit("完全正常的一句话"), null);
});
