import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatBits, qrMatrix, qrSvg } from "./encode";

// 二维码扫不出来只有用户拿手机试才知道，所以这里做两件事：
// ① 对齐规范里的已知常量（格式信息位串）
// ② 自写一个「反读」解码器做往返校验，证明布点/掩模/交织自洽

const MASK_FNS = [
  (r: number, c: number) => (r + c) % 2 === 0,
  (r: number) => r % 2 === 0,
  (_r: number, c: number) => c % 3 === 0,
  (r: number, c: number) => (r + c) % 3 === 0,
  (r: number, c: number) =>
    (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

const ALIGN: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const GROUPS: Record<number, [number, number][]> = {
  1: [[1, 16]],
  2: [[1, 28]],
  3: [[1, 44]],
  4: [[2, 32]],
  5: [[2, 43]],
  6: [[4, 27]],
  7: [[4, 31]],
  8: [
    [2, 38],
    [2, 39],
  ],
  9: [
    [3, 36],
    [2, 37],
  ],
  10: [
    [4, 43],
    [1, 44],
  ],
};

function isFunction(version: number, size: number, r: number, c: number) {
  if (r === 6 || c === 6) return true;
  if (r < 9 && c < 9) return true;
  if (r < 9 && c >= size - 8) return true;
  if (r >= size - 8 && c < 9) return true;
  if (version >= 7 && ((r < 6 && c >= size - 11) || (c < 6 && r >= size - 11))) {
    return true;
  }
  for (const ar of ALIGN[version]) {
    for (const ac of ALIGN[version]) {
      if (
        (ar <= 8 && ac <= 8) ||
        (ar <= 8 && ac >= size - 9) ||
        (ar >= size - 9 && ac <= 8)
      ) {
        continue;
      }
      if (Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) return true;
    }
  }
  return false;
}

/** 反读：读格式信息 → 去掩模 → 按之字形读码字 → 反交织 → 取正文 */
function decode(matrix: boolean[][]): string {
  const size = matrix.length;
  const version = (size - 17) / 4;

  // 读格式信息（左上那份），异或掩码后取出掩模号
  let raw = 0;
  const bit = (r: number, c: number) => (matrix[r][c] ? 1 : 0);
  for (let i = 0; i <= 5; i++) raw |= bit(i, 8) << i;
  raw |= bit(7, 8) << 6;
  raw |= bit(8, 8) << 7;
  raw |= bit(8, 7) << 8;
  for (let i = 9; i <= 14; i++) raw |= bit(8, 14 - i) << i;
  const unmasked = raw ^ 0x5412;
  const eccLevel = (unmasked >> 13) & 0b11;
  const mask = (unmasked >> 10) & 0b111;
  assert.equal(eccLevel, 0b00, "ECC 等级应为 M");

  // 去掩模后按之字形读回码字
  const bits: number[] = [];
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (isFunction(version, size, row, c)) continue;
        const masked = MASK_FNS[mask](row, c) ? 1 : 0;
        bits.push(bit(row, c) ^ masked);
      }
    }
    upward = !upward;
  }
  const codewords: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }

  // 反交织：按块长度还原数据码字顺序（纠错码字不需要，无误码）
  const blockSizes: number[] = [];
  for (const [count, len] of GROUPS[version]) {
    for (let i = 0; i < count; i++) blockSizes.push(len);
  }
  const blocks: number[][] = blockSizes.map(() => []);
  const maxLen = Math.max(...blockSizes);
  let idx = 0;
  for (let i = 0; i < maxLen; i++) {
    for (let b = 0; b < blocks.length; b++) {
      if (i < blockSizes[b]) blocks[b].push(codewords[idx++]);
    }
  }
  const data = blocks.flat();

  // 解正文：模式 0100 + 长度 + 字节
  const mode = data[0] >> 4;
  assert.equal(mode, 0b0100, "应为字节模式");
  const countBits = version < 10 ? 8 : 16;
  let cursor = 4;
  const readBits = (n: number) => {
    let value = 0;
    for (let i = 0; i < n; i++) {
      const byteIndex = (cursor + i) >> 3;
      const bitIndex = 7 - ((cursor + i) & 7);
      value = (value << 1) | ((data[byteIndex] >> bitIndex) & 1);
    }
    cursor += n;
    return value;
  };
  const length = readBits(countBits);
  const bytes: number[] = [];
  for (let i = 0; i < length; i++) bytes.push(readBits(8));
  return new TextDecoder().decode(new Uint8Array(bytes));
}

describe("formatBits 对齐规范常量", () => {
  it("ECC M 各掩模的 15 位格式信息与标准表一致", () => {
    // 标准表（ECC M）：mask0..7
    const expected = [
      0b101010000010010, 0b101000100100101, 0b101111001111100,
      0b101101101001011, 0b100010111111001, 0b100000011001110,
      0b100111110010111, 0b100101010100000,
    ];
    for (let mask = 0; mask < 8; mask++) {
      assert.equal(formatBits(mask), expected[mask], `mask ${mask}`);
    }
  });
});

describe("qrMatrix 结构", () => {
  it("尺寸符合版本公式，三个定位图案就位", () => {
    const m = qrMatrix("https://example.com/hello");
    const size = m.length;
    assert.equal((size - 17) % 4, 0);
    for (const [r0, c0] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ]) {
      // 定位图案：外环黑、内环白、核心黑
      assert.equal(m[r0][c0], true);
      assert.equal(m[r0 + 1][c0 + 1], false);
      assert.equal(m[r0 + 3][c0 + 3], true);
    }
    // 时序图案交替
    for (let i = 8; i < size - 8; i++) {
      assert.equal(m[6][i], i % 2 === 0);
      assert.equal(m[i][6], i % 2 === 0);
    }
  });

  it("固定黑点在 (size-8, 8)", () => {
    const m = qrMatrix("test");
    assert.equal(m[m.length - 8][8], true);
  });
});

describe("往返：编码后能按规范反读回原文", () => {
  const samples = [
    "hi",
    "https://passport.bilibili.com/qrcode/h5/login?oauthKey=abc123",
    "https://passport.bilibili.com/h5-app/passport/login/scan?navhide=1&qrcode_key=7f3b2c1d9e8a4f6b0c5d2e1a3b4c5d6e&from=",
    "必学堂 — 扫码登录",
    "x".repeat(150),
  ];
  for (const text of samples) {
    it(`「${text.slice(0, 24)}…」`, () => {
      assert.equal(decode(qrMatrix(text)), text);
    });
  }
});

describe("qrSvg", () => {
  it("产出自洽的 SVG（含留白与路径）", () => {
    const svg = qrSvg("https://example.com", 200);
    assert.match(svg, /^<svg xmlns/);
    assert.match(svg, /width="200" height="200"/);
    assert.match(svg, /<path d="M/);
  });
});
