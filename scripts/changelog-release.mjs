// npm version 的 version 生命周期钩子:把 CHANGELOG 的「## [未发布]」定版为
// 「## [X.Y.Z] - YYYY-MM-DD」,并在其上留一个新的空「## [未发布]」。
// 版本号取自 npm 注入的 npm_package_version(此时 package.json 已被 npm version 改好)。
import fs from "node:fs";

const version = process.env.npm_package_version;
if (!version) {
  console.error("changelog-release: 缺少 npm_package_version");
  process.exit(1);
}

const path = "CHANGELOG.md";
const text = fs.readFileSync(path, "utf-8");
const marker = "## [未发布]";
if (!text.includes(marker)) {
  console.error(`changelog-release: CHANGELOG.md 里找不到 "${marker}"`);
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
const replacement = `## [未发布]\n\n## [${version}] - ${date}`;
fs.writeFileSync(path, text.replace(marker, replacement), "utf-8");
console.log(`changelog-release: 定版 [${version}] - ${date}`);
