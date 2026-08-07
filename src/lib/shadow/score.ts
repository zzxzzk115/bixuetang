import Meyda from "meyda";
import { YIN } from "pitchfinder";

// 影子跟读的「跟读匹配度」评分——全在前端算，不碰服务器。
//
// 思路:两段单声道 PCM(原声 / 你的录音)各提两组特征——
//   · MFCC 序列(梅尔倒谱,近似「发音音素」)→ DTW 对齐求距离 = 发音相似度
//   · 基频 F0 曲线(音高,近似「语调」)     → DTW 对齐求距离 = 语调相似度
// DTW(动态时间规整)能对齐长短不一、语速不同的两段语音,这正是跟读的关键。
// 距离越小越像,再用指数映射成 0–100 分。常数按经验取,可调。

const FRAME = 512; // 必须是 2 的幂(Meyda 要求)
const HOP = 256;
const N_MFCC = 13;

/** 切成 512 长、步长 256 的重叠帧 */
function frames(samples: Float32Array): Float32Array[] {
  const out: Float32Array[] = [];
  for (let i = 0; i + FRAME <= samples.length; i += HOP) {
    out.push(samples.subarray(i, i + FRAME));
  }
  return out;
}

/** 逐帧 MFCC 序列 */
export function mfccSeq(samples: Float32Array, sampleRate: number): number[][] {
  Meyda.bufferSize = FRAME;
  Meyda.sampleRate = sampleRate;
  Meyda.numberOfMFCCCoefficients = N_MFCC;
  const seq: number[][] = [];
  for (const f of frames(samples)) {
    const mfcc = Meyda.extract("mfcc", f) as number[] | null;
    if (mfcc && mfcc.every((x) => Number.isFinite(x))) seq.push(mfcc);
  }
  return seq;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 逐帧基频(半音,已减去中位数做说话人无关归一);无声帧记 0 */
export function pitchSeq(samples: Float32Array, sampleRate: number): number[] {
  const detect = YIN({ sampleRate });
  const raw: number[] = [];
  for (const f of frames(samples)) {
    const hz = detect(f);
    raw.push(hz && hz > 0 ? 12 * Math.log2(hz) : NaN);
  }
  const voiced = raw.filter((x) => !Number.isNaN(x));
  const med = median(voiced);
  return raw.map((x) => (Number.isNaN(x) ? 0 : x - med));
}

function euclid(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

/**
 * 带 Sakoe-Chiba 带宽约束的 DTW,返回「归一化累积距离」= 总代价 /(n+m)。
 * band 是带宽占较长序列的比例,越小越快、越强制对齐。
 */
export function dtw(A: number[][], B: number[][], band = 0.2): number {
  const n = A.length;
  const m = B.length;
  if (n === 0 || m === 0) return Infinity;
  const w = Math.max(Math.floor(band * Math.max(n, m)), Math.abs(n - m));
  const INF = Infinity;
  let prev = new Array<number>(m + 1).fill(INF);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1).fill(INF);
    const lo = Math.max(1, i - w);
    const hi = Math.min(m, i + w);
    for (let j = lo; j <= hi; j++) {
      const cost = euclid(A[i - 1], B[j - 1]);
      cur[j] = cost + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    prev = cur;
  }
  return prev[m] / (n + m);
}

/** 距离 → 0–100:相同→~100,越不像越低。k 是经验尺度常数 */
function toScore(cost: number, k: number): number {
  if (!Number.isFinite(cost)) return 0;
  return 100 * Math.exp(-cost / k);
}

// 经验常数(在真实录音上还可再调)
const K_MFCC = 55;
const K_PITCH = 4;

export interface ShadowScore {
  /** 综合 0–100 */
  overall: number;
  /** 发音(MFCC) */
  phonetic: number;
  /** 语调(基频) */
  intonation: number;
}

/**
 * 给「原声」与「你的录音」打跟读匹配分。两段都要单声道 PCM + 同一/各自采样率。
 * 发音占 7 成、语调占 3 成(跟读首先要说对音,其次是语气语调)。
 */
export function scoreShadow(
  orig: Float32Array,
  user: Float32Array,
  origRate: number,
  userRate = origRate,
): ShadowScore {
  const mfccCost = dtw(mfccSeq(orig, origRate), mfccSeq(user, userRate));
  const pitchCost = dtw(
    pitchSeq(orig, origRate).map((v) => [v]),
    pitchSeq(user, userRate).map((v) => [v]),
  );
  const phonetic = toScore(mfccCost, K_MFCC);
  const intonation = toScore(pitchCost, K_PITCH);
  return {
    overall: Math.round(0.7 * phonetic + 0.3 * intonation),
    phonetic: Math.round(phonetic),
    intonation: Math.round(intonation),
  };
}
