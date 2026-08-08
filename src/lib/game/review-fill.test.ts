import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gradeFill,
  normalizeFill,
  shouldFillIn,
  FILL_MIN_REPS,
} from "./review-fill";

test("normalizeFill 全角转半角 + 去标点空白 + 小写", () => {
  assert.equal(normalizeFill("　ＲＥＬＵ　"), "relu");
  assert.equal(normalizeFill("梯度-下降"), "梯度下降");
  assert.equal(normalizeFill("Back Propagation!"), "backpropagation");
});

test("gradeFill 完全一致(含大小写/标点/全半角差异)判对", () => {
  assert.ok(gradeFill("ReLU", "relu"));
  assert.ok(gradeFill("梯度下降", "梯度-下降"));
  assert.ok(gradeFill("反向传播", "反向传播"));
});

test("gradeFill 小笔误在容差内判对,乱答判错", () => {
  assert.ok(gradeFill("gradient descnt", "gradient descent")); // 长词容 1-2
  assert.ok(!gradeFill("上升", "梯度下降"));
  assert.ok(!gradeFill("", "relu"));
});

test("gradeFill 短词要求严(不容错)", () => {
  assert.ok(!gradeFill("cat", "car")); // 长度 ≤4,容差 0
  assert.ok(gradeFill("car", "car"));
});

test("gradeFill 包含关系(都≥3)判对", () => {
  assert.ok(gradeFill("卷积神经网络", "卷积神经")); // "卷积神经"(4) 被包含,都≥3 → 对
});

test("gradeFill 单字/双字不靠包含蒙对", () => {
  assert.ok(!gradeFill("网络", "卷积神经网络")); // "网络"=2 <3,不判包含
});

test("gradeFill 双语术语打任一片段都算对", () => {
  assert.ok(gradeFill("权重", "weight 权重")); // 中文片段
  assert.ok(gradeFill("weight", "weight 权重")); // 英文片段
  assert.ok(gradeFill("weight 权重", "weight 权重")); // 整条
  assert.ok(!gradeFill("偏置", "weight 权重")); // 不相关 → 错
});

test("shouldFillIn 只对短 term 且 reps 达标", () => {
  assert.ok(shouldFillIn("term", FILL_MIN_REPS, "反向传播"));
  assert.ok(!shouldFillIn("term", FILL_MIN_REPS - 1, "反向传播")); // reps 不够
  assert.ok(!shouldFillIn("keypoint", 5, "反向传播")); // 非术语
  assert.ok(!shouldFillIn("term", 5, "这是一个特别特别长的术语名称超过上限")); // 太长
});
