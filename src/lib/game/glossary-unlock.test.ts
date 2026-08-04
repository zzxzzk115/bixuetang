import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  newlyUnlocked,
  unlockedTerms,
  type TermInput,
  type WatchedMap,
} from "./glossary-unlock";

function input(
  courseId: string,
  episodeN: number,
  term: string,
  definition = `${term} 的释义`,
  courseTitle = courseId.toUpperCase(),
): TermInput {
  return { courseId, courseTitle, episodeN, term, definition };
}

function watched(map: Record<string, number[]>): WatchedMap {
  return new Map(Object.entries(map).map(([k, v]) => [k, new Set(v)]));
}

describe("unlockedTerms", () => {
  it("没看过的集，术语不出现", () => {
    const out = unlockedTerms([input("a", 1, "梯度下降")], watched({}));
    assert.deepEqual(out, []);
  });

  it("看过的集，术语出现", () => {
    const out = unlockedTerms([input("a", 1, "梯度下降")], watched({ a: [1] }));
    assert.equal(out.length, 1);
    assert.equal(out[0].term, "梯度下降");
  });

  it("同一个词出现在多处时，只标注已看过的出处", () => {
    const out = unlockedTerms(
      [
        input("a", 1, "卷积"),
        input("a", 5, "卷积"),
        input("b", 2, "卷积", "另一种说法"),
      ],
      // a 只看了第 1 集，b 完全没看
      watched({ a: [1] }),
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].sources.length, 1);
    assert.equal(out[0].sources[0].courseId, "a");
    assert.deepEqual(out[0].sources[0].episodes, [1]);
    // b 那条释义还没解锁，不该混进来
    assert.deepEqual(out[0].definitions, ["卷积 的释义"]);
  });

  it("同课多集看过时，出处按集号排好序", () => {
    const out = unlockedTerms(
      [input("a", 7, "熵"), input("a", 2, "熵"), input("a", 4, "熵")],
      watched({ a: [2, 4, 7] }),
    );
    assert.deepEqual(out[0].sources[0].episodes, [2, 4, 7]);
  });

  it("同一个词的不同释义都收，重复的不收", () => {
    const out = unlockedTerms(
      [
        input("a", 1, "张量", "多维数组"),
        input("b", 1, "张量", "多维数组"),
        input("b", 2, "张量", "线性映射的坐标表示"),
      ],
      watched({ a: [1], b: [1, 2] }),
    );
    assert.deepEqual(out[0].definitions, ["多维数组", "线性映射的坐标表示"]);
    assert.equal(out[0].sources.length, 2);
  });

  it("大小写不同视为同一个词", () => {
    const out = unlockedTerms(
      [input("a", 1, "Tensor"), input("a", 2, "tensor")],
      watched({ a: [1, 2] }),
    );
    assert.equal(out.length, 1);
  });

  it("按词条排序，忽略大小写", () => {
    const out = unlockedTerms(
      [input("a", 1, "beta"), input("a", 1, "Alpha")],
      watched({ a: [1] }),
    );
    assert.deepEqual(
      out.map((t) => t.term),
      ["Alpha", "beta"],
    );
  });
});

describe("newlyUnlocked", () => {
  const bank = [
    input("a", 1, "反向传播"),
    input("a", 1, "激活函数"),
    input("a", 2, "反向传播"),
    input("a", 2, "批归一化"),
  ];

  it("首次看某集，该集的词全是新的", () => {
    const out = newlyUnlocked(bank, watched({}), "a", 1);
    assert.deepEqual(
      out.map((t) => t.term),
      ["反向传播", "激活函数"],
    );
  });

  it("别处已经见过的词不再算新解锁", () => {
    const out = newlyUnlocked(bank, watched({ a: [1] }), "a", 2);
    // 反向传播在第 1 集见过了，只剩批归一化是新的
    assert.deepEqual(
      out.map((t) => t.term),
      ["批归一化"],
    );
  });

  it("同一集里重复的词只报一次", () => {
    const out = newlyUnlocked(
      [input("a", 1, "熵"), input("a", 1, "熵")],
      watched({}),
      "a",
      1,
    );
    assert.equal(out.length, 1);
  });

  it("没有分析数据的集返回空，不报错", () => {
    assert.deepEqual(newlyUnlocked(bank, watched({}), "a", 99), []);
  });
});
