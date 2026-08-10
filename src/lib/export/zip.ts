// 极简 ZIP 打包器(store 模式,不压缩),零依赖——只为把「一门课一个 .md」打成
// 一个可拖进 Obsidian 库的 zip。实现 local header + central directory + EOCD 三段,
// 文件名按 UTF-8(置通用标志位 11),够 Obsidian/系统解压识别中文名。

const textEncoder = new TextEncoder();

// 标准 CRC-32(IEEE 802.3),ZIP 每个条目都要带
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** 条目路径,可含子目录(如 "笔记/线性代数.md") */
  name: string;
  content: string;
}

/** 把若干文本文件打成一个 store 模式的 zip 字节流 */
export function makeZip(entries: ZipEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
  const u32 = (v: number) =>
    new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);

  for (const e of entries) {
    const nameBytes = textEncoder.encode(e.name);
    const data = textEncoder.encode(e.content);
    const crc = crc32(data);
    const flags = 0x0800; // bit 11: 文件名为 UTF-8

    // 本地文件头
    const local = concat([
      u32(0x04034b50),
      u16(20), // version needed
      u16(flags),
      u16(0), // method 0 = store
      u16(0),
      u16(0), // mtime / mdate
      u32(crc),
      u32(data.length), // compressed size
      u32(data.length), // uncompressed size
      u16(nameBytes.length),
      u16(0), // extra len
      nameBytes,
      data,
    ]);
    parts.push(local);

    // 中央目录记录
    central.push(
      concat([
        u32(0x02014b50),
        u16(20), // version made by
        u16(20), // version needed
        u16(flags),
        u16(0), // method
        u16(0),
        u16(0), // mtime / mdate
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0), // extra
        u16(0), // comment
        u16(0), // disk number
        u16(0), // internal attrs
        u32(0), // external attrs
        u32(offset), // local header offset
        nameBytes,
      ]),
    );
    offset += local.length;
  }

  const centralBytes = concat(central);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0), // disk numbers
    u16(entries.length),
    u16(entries.length),
    u32(centralBytes.length),
    u32(offset), // central dir offset
    u16(0), // comment len
  ]);

  return concat([...parts, centralBytes, eocd]);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
