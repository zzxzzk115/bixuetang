// 生成子集化的像素字体：public/fonts/ark-pixel-12px-subset.woff2
//
// 方舟像素字体（Ark Pixel Font，OFL-1.1）的 zh_cn 全量是 534 KB，
// 而站点实际用到的汉字只有几千个。这里扫描 content/ 与源码里出现过的字符，
// 用 pyftsubset 只保留这些字形——体积能降一个数量级。
//
// 为什么非要像素字体：游戏画布里的中文原本用微软雅黑渲染在 6-7px，
// 矢量字体在这个尺寸下必然糊成一团，再被画布放大就更糊。
// 像素字体按设计尺寸（12px）整数倍使用才能保持硬边清晰。
//
// 用法：
//   node scripts/gen-pixel-font.mjs            # 用缓存的原始字体
//   node scripts/gen-pixel-font.mjs --download # 强制重新下载原始字体
//
// 需要 python + fontTools（pip install fonttools brotli）。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const VERSION = "2026.07.20";
const VARIANT = "ark-pixel-12px-proportional-zh_cn.otf.woff2";
const CACHE_DIR = path.join(ROOT, ".cache", "fonts");
const SRC = path.join(CACHE_DIR, VARIANT);
const OUT_DIR = path.join(ROOT, "public", "fonts");
const OUT = path.join(OUT_DIR, "ark-pixel-12px-subset.woff2");

/** 站点固定文案里的字（导航、按钮、标签……），源码扫描兜不住的补在这里 */
const ALWAYS = [
  "必学堂冒险路径副本图鉴技能星盘转职殿堂实验室术语表设置登出登录注册",
  "等级经验金币连击生命魔力攻击防御速度暴击闪避",
  "已讨伐攻略中待命已撤退基础进阶高阶未解锁可点亮已点亮前置课程通关",
  "第章节集话讲部分上下左右前后开始结束继续返回确认取消保存删除搜索",
  "宝箱怪物boss战斗胜利失败奖励掉落装备道具背包商店任务成就",
  "小时分钟秒天周月年个门条项次点分",
  "０１２３４５６７８９",
];

function readAllText(dir, exts, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) readAllText(full, exts, acc);
    else if (exts.some((x) => e.name.endsWith(x))) {
      acc.push(fs.readFileSync(full, "utf-8"));
    }
  }
  return acc;
}

function collectChars() {
  const chunks = [...ALWAYS];
  // 课程标题、分集标题、知识点、术语——玩家在游戏画布与页面上真正会看到的字
  readAllText(path.join(ROOT, "content"), [".yaml", ".yml", ".json"], chunks);
  // 源码里的中文字面量
  readAllText(path.join(ROOT, "src"), [".ts", ".tsx"], chunks);

  const set = new Set();
  for (const chunk of chunks) {
    for (const ch of chunk) {
      const code = ch.codePointAt(0);
      // 控制字符不要；其余（含 ASCII、标点、汉字、假名）全收
      if (code >= 0x20) set.add(ch);
    }
  }
  // 常用标点与符号兜底，避免内容里恰好没出现就缺字
  for (const ch of "　、。，．·？！：；“”‘’（）【】《》〈〉—…～＋－×÷＝％←→↑↓★☆◆◇■□●○▶◀▲▼") {
    set.add(ch);
  }
  return [...set].sort();
}

function download() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const url =
    `https://github.com/TakWolf/ark-pixel-font/releases/download/${VERSION}/` +
    `ark-pixel-font-12px-proportional-otf.woff2-v${VERSION}.zip`;
  const zip = path.join(CACHE_DIR, "ark.zip");
  console.log(`下载 ${url}`);
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Invoke-WebRequest -Uri '${url}' -OutFile '${zip}' -UseBasicParsing; ` +
        `Expand-Archive -Path '${zip}' -DestinationPath '${CACHE_DIR}' -Force`,
    ],
    { stdio: "inherit" },
  );
}

function main() {
  if (process.argv.includes("--download") || !fs.existsSync(SRC)) {
    download();
  }
  if (!fs.existsSync(SRC)) {
    console.error(`找不到原始字体 ${SRC}，试试 --download`);
    process.exit(1);
  }

  const chars = collectChars();
  const listFile = path.join(CACHE_DIR, "subset-chars.txt");
  fs.writeFileSync(listFile, chars.join(""), "utf-8");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  execFileSync(
    "pyftsubset",
    [
      SRC,
      `--text-file=${listFile}`,
      "--flavor=woff2",
      `--output-file=${OUT}`,
      "--layout-features=*",
      "--no-hinting",
      "--desubroutinize",
    ],
    { stdio: "inherit" },
  );

  const before = fs.statSync(SRC).size;
  const after = fs.statSync(OUT).size;
  console.log(
    `\n字形 ${chars.length} 个 · ${Math.round(before / 1024)} KB → ` +
      `${Math.round(after / 1024)} KB（${(100 - (after / before) * 100).toFixed(1)}% 减少）`,
  );
  console.log(`产物：${path.relative(ROOT, OUT)}`);
}

main();
