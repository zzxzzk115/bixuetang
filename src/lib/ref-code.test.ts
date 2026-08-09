import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRef, encodeRef, REF_CODE_RE } from "./ref-code";

test("编码后能解回同一个 id", () => {
  for (const id of [1, 7, 42, 1000, 999999]) {
    const code = encodeRef(id);
    assert.equal(decodeRef(code), id);
  }
});

test("编码结果不含明文 id、且符合 middleware 放行格式", () => {
  const code = encodeRef(123456);
  assert.ok(!code.includes("123456"), "不应出现明文 id");
  assert.match(code, REF_CODE_RE);
});

test("签名被篡改则解码失败", () => {
  const code = encodeRef(42);
  const [payload, sig] = code.split("~");
  // 改载荷(指向别的 id)但沿用旧签名 → 应拒
  assert.equal(decodeRef(`${parseInt(payload, 36) + 1}~${sig}`), null);
  // 改签名 → 应拒
  assert.equal(decodeRef(`${payload}~AAAAAAAAAA`), null);
});

test("垃圾输入一律 null", () => {
  for (const bad of ["", "42", "abc", "~~~", "1~", "~abc"]) {
    assert.equal(decodeRef(bad), null);
  }
});
