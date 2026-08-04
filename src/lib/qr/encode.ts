// 极简 QR 码编码器（字节模式 + ECC 等级 M，版本 1~10）。
// 只为「bilibili 扫码登录」这一个场景服务：URL 约 100 字节，版本 6~7 足够。
// 自己写是为了不引第三方依赖（CSP 下也不用外部图床画码）。
//
// 算法：数据编码 → RS 纠错 → 分块交织 → 矩阵布点 → 掩模择优 → 格式信息。

// ---------- GF(256) ----------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a: number, b: number) =>
  a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];

function rsGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGenerator(ecLen);
  const res = new Uint8Array(data.length + ecLen);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const factor = res[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      res[i + j] ^= mul(gen[j], factor);
    }
  }
  return res.slice(data.length);
}

// ---------- 版本表（ECC 等级 M） ----------
interface VersionSpec {
  /** 每块纠错码字数 */
  ec: number;
  /** [块数, 每块数据码字数][] */
  groups: [number, number][];
  /** 校正图案中心坐标 */
  align: number[];
}

const VERSIONS: Record<number, VersionSpec> = {
  1: { ec: 10, groups: [[1, 16]], align: [] },
  2: { ec: 16, groups: [[1, 28]], align: [6, 18] },
  3: { ec: 26, groups: [[1, 44]], align: [6, 22] },
  4: { ec: 18, groups: [[2, 32]], align: [6, 26] },
  5: { ec: 24, groups: [[2, 43]], align: [6, 30] },
  6: { ec: 16, groups: [[4, 27]], align: [6, 34] },
  7: { ec: 18, groups: [[4, 31]], align: [6, 22, 38] },
  8: { ec: 22, groups: [[2, 38], [2, 39]], align: [6, 24, 42] },
  9: { ec: 22, groups: [[3, 36], [2, 37]], align: [6, 26, 46] },
  10: { ec: 26, groups: [[4, 43], [1, 44]], align: [6, 28, 50] },
};

function dataCodewords(version: number): number {
  return VERSIONS[version].groups.reduce((sum, [n, k]) => sum + n * k, 0);
}

function byteCapacity(version: number): number {
  const countBits = version < 10 ? 8 : 16;
  return Math.floor((dataCodewords(version) * 8 - 4 - countBits) / 8);
}

function pickVersion(byteLen: number): number {
  for (let v = 1; v <= 10; v++) {
    if (byteCapacity(v) >= byteLen) return v;
  }
  throw new Error("内容太长，超出本编码器支持的 QR 版本");
}

// ---------- 数据编码 ----------
function encodeData(bytes: Uint8Array, version: number): Uint8Array {
  const total = dataCodewords(version);
  const countBits = version < 10 ? 8 : 16;
  const bits: number[] = [];
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };

  push(0b0100, 4); // 字节模式
  push(bytes.length, countBits);
  for (const b of bytes) push(b, 8);

  // 终止符 + 补齐到字节
  const capacityBits = total * 8;
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const out = new Uint8Array(total);
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    out[i / 8] = byte;
  }
  // 填充码字 0xEC / 0x11 交替
  for (let i = bits.length / 8, k = 0; i < total; i++, k++) {
    out[i] = k % 2 === 0 ? 0xec : 0x11;
  }
  return out;
}

/** 分块 + 交织（数据在前、纠错在后） */
function interleave(data: Uint8Array, version: number): Uint8Array {
  const spec = VERSIONS[version];
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (const [blocks, size] of spec.groups) {
    for (let i = 0; i < blocks; i++) {
      const chunk = data.slice(offset, offset + size);
      offset += size;
      dataBlocks.push(chunk);
      ecBlocks.push(rsEncode(chunk, spec.ec));
    }
  }
  const out: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < spec.ec; i++) {
    for (const block of ecBlocks) out.push(block[i]);
  }
  return new Uint8Array(out);
}

// ---------- 矩阵 ----------
type Matrix = Int8Array[]; // -1=空 0=白 1=黑

function createMatrix(size: number): Matrix {
  return Array.from({ length: size }, () => new Int8Array(size).fill(-1));
}

function placeFinder(m: Matrix, row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
      const inRing =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      m[rr][cc] = inRing || inCore ? 1 : 0;
    }
  }
}

function placeAlignment(m: Matrix, version: number) {
  const centers = VERSIONS[version].align;
  const size = m.length;
  for (const r of centers) {
    for (const c of centers) {
      // 与定位图案重叠的三个角跳过
      if (
        (r <= 8 && c <= 8) ||
        (r <= 8 && c >= size - 9) ||
        (r >= size - 9 && c <= 8)
      ) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          m[r + dr][c + dc] = ring === 1 ? 0 : 1;
        }
      }
    }
  }
}

function placeTiming(m: Matrix) {
  const size = m.length;
  for (let i = 8; i < size - 8; i++) {
    const bit = i % 2 === 0 ? 1 : 0;
    if (m[6][i] === -1) m[6][i] = bit;
    if (m[i][6] === -1) m[i][6] = bit;
  }
}

/** 预留格式/版本信息区（先占位，后填） */
function reserveInfo(m: Matrix, version: number) {
  const size = m.length;
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === -1) m[8][i] = 0;
    if (m[i][8] === -1) m[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][size - 1 - i] === -1) m[8][size - 1 - i] = 0;
    if (m[size - 1 - i][8] === -1) m[size - 1 - i][8] = 0;
  }
  m[size - 8][8] = 1; // 固定黑点
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        m[size - 11 + j][i] = 0;
        m[i][size - 11 + j] = 0;
      }
    }
  }
}

function placeData(m: Matrix, codewords: Uint8Array) {
  const size = m.length;
  let bitIndex = 0;
  const nextBit = () => {
    const byte = codewords[bitIndex >> 3];
    const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
    bitIndex++;
    return bit;
  };

  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // 跳过竖向时序列
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (m[row][c] === -1) m[row][c] = nextBit();
      }
    }
    upward = !upward;
  }
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function isFunctionModule(version: number, size: number, r: number, c: number) {
  if (r === 6 || c === 6) return true;
  if (r < 9 && c < 9) return true;
  if (r < 9 && c >= size - 8) return true;
  if (r >= size - 8 && c < 9) return true;
  if (version >= 7 && ((r < 6 && c >= size - 11) || (c < 6 && r >= size - 11))) {
    return true;
  }
  for (const ar of VERSIONS[version].align) {
    for (const ac of VERSIONS[version].align) {
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

function penalty(m: Matrix): number {
  const size = m.length;
  let score = 0;
  // 规则 1：同色连续
  for (let i = 0; i < size; i++) {
    for (const line of [m[i], m.map((row) => row[i])]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        if (line[j] === line[j - 1]) run++;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
  }
  // 规则 2：2×2 同色块
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) {
        score += 3;
      }
    }
  }
  // 规则 3：类定位图案（正反两个朝向都算）
  const pattern = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const reversed = [...pattern].reverse();
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const hit = (p: number[], get: (k: number) => number) =>
        p.every((want, k) => get(k) === want);
      if (c + 11 <= size) {
        if (hit(pattern, (k) => m[r][c + k])) score += 40;
        if (hit(reversed, (k) => m[r][c + k])) score += 40;
      }
      if (r + 11 <= size) {
        if (hit(pattern, (k) => m[r + k][c])) score += 40;
        if (hit(reversed, (k) => m[r + k][c])) score += 40;
      }
    }
  }
  // 规则 4：黑白比例
  let dark = 0;
  for (const row of m) for (const v of row) if (v === 1) dark++;
  const ratio = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10;
  return score;
}

function bch(value: number, generator: number, genBits: number): number {
  let result = value << (genBits - 1);
  const genLen = 32 - Math.clz32(generator);
  while (32 - Math.clz32(result) >= genLen) {
    result ^= generator << (32 - Math.clz32(result) - genLen);
  }
  return result;
}

/** 格式信息 15 位（ECC 等级 M + 掩模号，含 BCH 与掩码异或） */
export function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask; // M = 0b00
  return ((data << 10) | bch(data, 0x537, 11)) ^ 0x5412;
}

function placeFormat(m: Matrix, mask: number) {
  const size = m.length;
  const bits = formatBits(mask);
  const get = (i: number) => (bits >> i) & 1;

  // 左上：竖条在第 8 列（行 0-5、7、8），横条在第 8 行（列 0-5，跳过时序列 6）
  for (let i = 0; i <= 5; i++) m[i][8] = get(i);
  m[7][8] = get(6);
  m[8][8] = get(7);
  m[8][7] = get(8);
  for (let i = 9; i <= 14; i++) m[8][14 - i] = get(i);

  // 右上 + 左下第二份
  for (let i = 0; i <= 7; i++) m[8][size - 1 - i] = get(i);
  for (let i = 8; i <= 14; i++) m[size - 15 + i][8] = get(i);
  m[size - 8][8] = 1; // 固定黑点
}

function placeVersion(m: Matrix, version: number) {
  if (version < 7) return;
  const size = m.length;
  const bits = (version << 12) | bch(version, 0x1f25, 13);
  for (let i = 0; i < 18; i++) {
    const bit = (bits >> i) & 1;
    const r = Math.floor(i / 3);
    const c = (i % 3) + size - 11;
    m[r][c] = bit;
    m[c][r] = bit;
  }
}

/** 生成 QR 矩阵：true=黑 */
export function qrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length);
  const size = version * 4 + 17;

  const base = createMatrix(size);
  placeFinder(base, 0, 0);
  placeFinder(base, 0, size - 7);
  placeFinder(base, size - 7, 0);
  placeAlignment(base, version);
  placeTiming(base);
  reserveInfo(base, version);

  const codewords = interleave(encodeData(bytes, version), version);
  const withData = base.map((row) => Int8Array.from(row));
  placeData(withData, codewords);

  let best: Matrix | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = withData.map((row) => Int8Array.from(row));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (isFunctionModule(version, size, r, c)) continue;
        if (MASKS[mask](r, c)) candidate[r][c] ^= 1;
      }
    }
    placeFormat(candidate, mask);
    placeVersion(candidate, version);
    const score = penalty(candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best!.map((row) => Array.from(row, (v) => v === 1));
}

/** 直接产出 SVG（服务端渲染进页面，前端零依赖） */
export function qrSvg(text: string, size = 220): string {
  const matrix = qrMatrix(text);
  const n = matrix.length;
  const quiet = 2;
  const total = n + quiet * 2;
  let path = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
