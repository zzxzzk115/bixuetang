// 生成五十音发音音频到 public/kana/<romaji>.mp3(平/片假名读音相同,按罗马音命名即可共用)。
// 用 edge-tts(微软在线 TTS,免费,ja-JP-NanamiNeural 女声)。需要:pip install edge-tts 和 ffmpeg。
//   运行: pnpm exec tsx scripts/gen-kana-audio.ts
// 之后 public/kana/*.mp3 提交进仓库,前端优先播它,浏览器无日语语音也有声。
//
// 后处理必不可少:edge-tts 原始输出前后带大段静音,且短 MP3 末尾常有解码爆音(听感是"奇怪尾音")。
// 用 ffmpeg 掐掉两端静音、首尾各加一小段淡入淡出让波形收到零、再补 60ms 干净静音尾——
// 保证任何设备上收听都干净利落,没有咔哒声。
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { ALL_KANA } from "../src/lib/game/kana-data";

const VOICE = "ja-JP-NanamiNeural";
// 掐静音(阈值 -45dB)→ 首 15ms 淡入去起爆音 → 末 45ms 淡出收到零去尾爆音 → 补 60ms 静音尾。
// 末端淡出用「倒放+淡入+再倒放」实现,免去先探时长。
const CLEANUP_FILTER = [
  "silenceremove=start_periods=1:start_threshold=-45dB:start_duration=0.02",
  "areverse",
  "silenceremove=start_periods=1:start_threshold=-45dB:start_duration=0.02",
  "areverse",
  "afade=t=in:st=0:d=0.015",
  "areverse",
  "afade=t=in:st=0:d=0.045",
  "areverse",
  "apad=pad_dur=0.06",
].join(",");

mkdirSync("public/kana", { recursive: true });

let ok = 0;
for (const kana of ALL_KANA) {
  const out = `public/kana/${kana.romaji}.mp3`;
  const raw = `${out}.raw.mp3`;
  try {
    execFileSync(
      "python",
      ["-m", "edge_tts", "--voice", VOICE, "--text", kana.hira, "--write-media", raw],
      { stdio: "ignore" },
    );
    execFileSync(
      "ffmpeg",
      ["-y", "-i", raw, "-af", CLEANUP_FILTER, "-codec:a", "libmp3lame", "-q:a", "4", out],
      { stdio: "ignore" },
    );
    execFileSync("node", ["-e", `require("fs").rmSync(${JSON.stringify(raw)})`], { stdio: "ignore" });
    ok++;
    console.log(`✓ ${kana.hira} (${kana.romaji}) → ${out}`);
  } catch (e) {
    console.error(`✗ ${kana.hira} 生成失败:`, (e as Error).message);
  }
}
console.log(`\n完成 ${ok}/${ALL_KANA.length}`);
