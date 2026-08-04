// 由 src/lib/brand/sigil.ts 的路径定义生成静态品牌资源。
// 改完徽记跑 `npm run brand:gen`，产物会被提交进仓库（构建期不再依赖本脚本）。
//
// 产物：
//   src/app/icon.svg   Next.js App Router 自动挂成 favicon
//   public/og.svg      分享卡片底图

import fs from "node:fs";
import path from "node:path";
import { SIGIL_COLORS, SIGIL_SIZE, sigilBody, sigilSvg } from "../src/lib/brand/sigil";

const ROOT = process.cwd();
const BANNER = "<!-- 由 npm run brand:gen 生成，改 src/lib/brand/sigil.ts 后重跑 -->";

function writeIcon() {
  const file = path.join(ROOT, "src", "app", "icon.svg");
  fs.writeFileSync(file, `${BANNER}\n${sigilSvg(32)}\n`, "utf-8");
  console.log(`✔ ${path.relative(ROOT, file)}`);
}

/** OG 图：深底 + 居中放大的徽记 + 站名，1200×630 */
function writeOg() {
  const art = 288;
  const scale = art / SIGIL_SIZE;
  const x0 = (1200 - art) / 2;
  const y0 = 140;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">` +
    `<rect width="1200" height="630" fill="${SIGIL_COLORS.bg}"/>` +
    `<rect x="24" y="24" width="1152" height="582" rx="18" fill="none" ` +
    `stroke="${SIGIL_COLORS.green}" stroke-width="3"/>` +
    `<g transform="translate(${x0} ${y0}) scale(${scale})">${sigilBody()}</g>` +
    `<text x="600" y="512" text-anchor="middle" fill="${SIGIL_COLORS.text}" ` +
    `font-family="system-ui, sans-serif" font-size="68" font-weight="800">必学堂</text>` +
    `<text x="600" y="562" text-anchor="middle" fill="${SIGIL_COLORS.green}" ` +
    `font-family="system-ui, sans-serif" font-size="26" font-weight="700" ` +
    `letter-spacing="4">把公开课，学成通关</text>` +
    `</svg>`;

  const file = path.join(ROOT, "public", "og.svg");
  fs.writeFileSync(file, `${BANNER}\n${svg}\n`, "utf-8");
  console.log(`✔ ${path.relative(ROOT, file)}`);
}

writeIcon();
writeOg();
console.log("品牌资源已生成");
