// 生成五十音发音音频到 public/kana/<romaji>.mp3(平/片假名读音相同,按罗马音命名即可共用)。
// 用 edge-tts(微软在线 TTS,免费,ja-JP-NanamiNeural 女声)。需要:pip install edge-tts。
//   运行: pnpm exec tsx scripts/gen-kana-audio.ts
// 之后 public/kana/*.mp3 提交进仓库,前端优先播它,浏览器无日语语音也有声。
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { ALL_KANA } from "../src/lib/game/kana-data";

const VOICE = "ja-JP-NanamiNeural";
mkdirSync("public/kana", { recursive: true });

let ok = 0;
for (const kana of ALL_KANA) {
  const out = `public/kana/${kana.romaji}.mp3`;
  try {
    execFileSync(
      "python",
      ["-m", "edge_tts", "--voice", VOICE, "--text", kana.hira, "--write-media", out],
      { stdio: "ignore" },
    );
    ok++;
    console.log(`✓ ${kana.hira} (${kana.romaji}) → ${out}`);
  } catch (e) {
    console.error(`✗ ${kana.hira} 生成失败:`, (e as Error).message);
  }
}
console.log(`\n完成 ${ok}/${ALL_KANA.length}`);
