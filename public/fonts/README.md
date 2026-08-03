# 像素字体

`ark-pixel-12px-subset.woff2` — 方舟像素字体（Ark Pixel Font）12px 比例版
zh_cn 变体的子集。

- 作者：TakWolf
- 来源：https://github.com/TakWolf/ark-pixel-font
- 版本：2026.07.20
- 许可：SIL Open Font License 1.1（全文见同目录 `OFL.txt`）

## 为什么要它

游戏画布里的中文原先用微软雅黑渲染在 6–7px。矢量字体在这个尺寸下笔画会糊成
一团，再被 Phaser 的画布缩放放大，就更看不清了。像素字体在其设计尺寸
（12px）及其整数倍下每个笔画都落在整像素上，缩放后依然是硬边。

**使用时字号必须是 12 的整数倍**（12px / 24px / 36px），否则会重新引入模糊。

## 怎么重新生成

字符集来自 `content/` 与 `src/` 里实际出现过的字符，所以新增课程后需要重跑，
否则新课标题里的生僻字会缺字（回退到系统字体，视觉上突兀）：

```bash
npm run font:gen
```

原始字体 534 KB，子集后 62 KB。原始文件缓存在 `.cache/fonts/`（已 gitignore），
首次运行会自动下载。需要 `python` 与 `fontTools`（`pip install fonttools brotli`）。
