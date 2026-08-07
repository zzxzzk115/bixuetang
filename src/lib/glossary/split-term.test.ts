import assert from "node:assert/strict";
import test from "node:test";
import { splitBilingualTerm } from "./split-term";

test("moves repeated numeric tree prefix to the Chinese name", () => {
  assert.deepEqual(splitBilingualTerm("2-3 Tree 2-3 树"), {
    en: "2-3 Tree",
    zh: "2-3 树",
  });
});

test("moves a one-letter translated prefix", () => {
  assert.deepEqual(splitBilingualTerm("A* Algorithm A 星算法"), {
    en: "A* Algorithm",
    zh: "A 星算法",
  });
});

test("moves duplicated symbolic language prefix", () => {
  assert.deepEqual(splitBilingualTerm("C++ Language C++ 语言"), {
    en: "C++ Language",
    zh: "C++ 语言",
  });
});

test("keeps a genuine English tail with the English name", () => {
  assert.deepEqual(splitBilingualTerm("REST API 接口"), {
    en: "REST API",
    zh: "接口",
  });
});

test("keeps monolingual terms intact", () => {
  assert.deepEqual(splitBilingualTerm("ABI"), { en: "ABI", zh: "" });
});

test("keeps trailing letter that the Chinese side already repeats", () => {
  // 「大 O 记号」自带 O:英文侧的 O 是 Big O 的本体,不该搬家
  assert.deepEqual(splitBilingualTerm("Big O 大 O 记号"), {
    en: "Big O",
    zh: "大 O 记号",
  });
});
