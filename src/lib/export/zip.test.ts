import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crc32, makeZip } from "./zip";

const dec = new TextDecoder();
const enc = new TextEncoder();

// 只为测试:解析 store 模式 zip 的中央目录,取回每个条目的名字与内容。
function parseZip(buf: Uint8Array): Map<string, string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // 找 EOCD(无 zip 注释时在末尾 22 字节)
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  assert.notEqual(eocd, -1, "找不到 EOCD");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true); // 中央目录起始
  const out = new Map<string, string>();
  for (let n = 0; n < count; n++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50, "中央目录签名错");
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    // 到本地头取数据
    assert.equal(dv.getUint32(localOff, true), 0x04034b50, "本地头签名错");
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    // 校验 CRC 与中央目录记录一致
    assert.equal(crc32(data), dv.getUint32(p + 16, true), `${name} CRC 不符`);
    out.set(name, dec.decode(data));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe("zip store 打包", () => {
  it("往返:名字与内容一致(含中文名/子目录/UTF-8)", () => {
    const entries = [
      { name: "笔记/线性代数.md", content: "# 线性代数\n第一条笔记\n" },
      { name: "README.md", content: "hello 世界 🌏" },
      { name: "空.md", content: "" },
    ];
    const zip = makeZip(entries);
    const back = parseZip(zip);
    assert.equal(back.size, 3);
    for (const e of entries) assert.equal(back.get(e.name), e.content);
  });

  it("crc32 命中已知值", () => {
    // "123456789" 的 CRC-32 标准值 0xCBF43926
    assert.equal(crc32(enc.encode("123456789")), 0xcbf43926);
  });
});
