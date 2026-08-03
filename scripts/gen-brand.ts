// 由 src/lib/brand/sigil.ts 的像素网格生成静态品牌资源。
// 改完网格跑 `npm run brand:gen`，产物会被提交进仓库（构建期不再依赖本脚本）。
//
// 产物：
//   src/app/icon.svg   Next.js App Router 自动挂成 favicon
//   public/og.svg      分享卡片底图

import fs from "node:fs";
import path from "node:path";
import { SIGIL_COLORS, SIGIL_SIZE, sigilRects, sigilSvg } from "../src/lib/brand/sigil";

const ROOT = process.cwd();
const BANNER = "<!-- 由 npm run brand:gen 生成，改 src/lib/brand/sigil.ts 后重跑 -->";

function writeIcon() {
  const file = path.join(ROOT, "src", "app", "icon.svg");
  fs.writeFileSync(file, `${BANNER}\n${sigilSvg(32)}\n`, "utf-8");
  console.log(`✔ ${path.relative(ROOT, file)}`);
}

/** OG 图：深底 + 居中放大的徽记 + 站名，1200×630 */
function writeOg() {
  const scale = 18;
  const art = SIGIL_SIZE * scale; // 288
  const x0 = (1200 - art) / 2;
  const y0 = 150;
  const rects = sigilRects()
    .map(
      (r) =>
        `<rect x="${x0 + r.x * scale}" y="${y0 + r.y * scale}" ` +
        `width="${r.w * scale}" height="${scale}" fill="${r.fill}"/>`,
    )
    .join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" shape-rendering="crispEdges">` +
    `<rect width="1200" height="630" fill="#0e1017"/>` +
    `<rect x="24" y="24" width="1152" height="582" fill="none" stroke="${SIGIL_COLORS.gold}" stroke-width="2"/>` +
    rects +
    `<text x="600" y="512" text-anchor="middle" fill="${SIGIL_COLORS.page}" ` +
    `font-family="Georgia, serif" font-size="64" font-weight="700">学者公会</text>` +
    `<text x="600" y="560" text-anchor="middle" fill="${SIGIL_COLORS.gold}" ` +
    `font-family="monospace" font-size="24" letter-spacing="6">ACADEMIC ADVENTURE</text>` +
    `</svg>`;

  const file = path.join(ROOT, "public", "og.svg");
  fs.writeFileSync(file, `${BANNER}\n${svg}\n`, "utf-8");
  console.log(`✔ ${path.relative(ROOT, file)}`);
}

writeIcon();
writeOg();
console.log("品牌资源已生成");
