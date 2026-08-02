# 学者公会 Guild

游戏闯关式理科自学网站：把 bilibili / YouTube 上的世界名校公开课整理成「副本」，
看完一集击败一只小怪，通关一门课讨伐 Boss，升级攒技能点、点亮技能树、转职换称号。
面向中文母语学习者。课程来源以 [csdiy.wiki](https://csdiy.wiki/) 与 MIT OCW / GAMES 系列为主。

**当前内容量**：116 门课程 · 18 条冒险路径 · 58 个技能节点 · 31 个职业。

## 玩法概念

| 游戏概念 | 对应现实 |
|---|---|
| 副本 | 一门公开课（多视频源：B 站 / YouTube） |
| 小怪 | 一集视频，勾选即击败，+XP |
| Boss | 整课全部集数看完，触发通关结算奖励 |
| 冒险路径 | 由浅入深的学习路线（分章节） |
| 技能树 | 放射式天赋盘：学科分扇区、tier 分圈层，完成课程 + 花技能点点亮 |
| 转职 | 一转选学徒方向，二转细分/兼修，三转传说职业 |

## 附属系统

- **Hack 实验室**（`/lab/hack`）：nand2tetris 全链路浏览器移植——Jack 编译器 →
  VM 翻译器 → 汇编器 → CPU 模拟器 + WebGL 屏幕。OS 有两种模式：原生模式走 CPU
  级 trap 由 TS 实现（快），**纯血模式**把 Jack 写的 OS 一起编译进 ROM，
  乘除法/内存分配/绘图全部真跑在模拟 CPU 上。
- **数学工坊**（`/lab/math`）：MathLive 公式输入 + compute-engine 求值/化简/求导 + 函数图像。
- **术语对照表**（`/glossary`）：聚合各课 AI 分析产出的中英术语，可搜索、可跳回原课。
- **浏览器插件**（`extension/`）：在 B 站 / YouTube 原站看视频时自动回传观看进度。

## 本地开发

```bash
npm install
npm run dev        # 启动时自动建库迁移，DB 在 ./data/dev.db
```

## Docker 部署

```bash
docker compose up -d --build
```

访问 http://localhost:3000。数据库持久化在 `guild-data` volume；
HTTPS 反代部署时把 compose 里 `COOKIE_SECURE` 改为 `"1"`。

## 常用命令

```bash
npm test              # 纯函数单测（游戏机制 + Hack 工具链 + 数学引擎）
npm run validate      # 校验 content/（Zod + 引用完整性 + DAG 环检测）
npm run fetch:episodes  # 从 B 站 API 拉取各课真实分集标题写回 YAML
npm run check:links -- --bili   # 体检所有视频源是否还活着
npm run db:generate   # 修改 src/lib/db/schema.ts 后生成迁移
```

## 添加课程

在 `content/courses/<subject>/` 下新建 YAML（字段见 `src/lib/content/schema.ts`），
跑 `npm run validate` 通过即可。原则：

- 视频源优先官方账号（3B1B、跟李沐学AI 等），搬运号标注 `uploader`，`note` 写字幕质量与版本年份
- **BV 号必须核实**：写进 YAML 前用 `https://api.bilibili.com/x/web-interface/view?bvid=<BV>`
  确认标题与课程对得上。搜索结果里的 BV 号张冠李戴很常见，宁可没有源也不要挂错课。
- 找不到原课录像时，可以挂**同主题替代课或中文对应课**，但 `note` 里必须写明它不是原课搬运
- 一门课至少一个 `sources`；B 站 `/video/BVxxx` 与 YouTube watch/playlist 链接可内嵌播放，其他链接自动降级为外链卡片
- 笔记外链放 `notes`，学习路径在 `content/paths/`，技能树 `content/skill-tree.yaml`，职业 `content/jobs.yaml`
- 分集标题不用手写，`npm run fetch:episodes` 会从 B 站拉真实的（多 P 与合集两种结构都支持）

内容即代码：改动经 PR 审阅合并，重新构建镜像后生效。数据库只存用户数据。

## 技术栈

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
SQLite (better-sqlite3 + Drizzle ORM) · argon2id + cookie session ·
CodeMirror 6（Hack 实验室编辑器）· MathLive + compute-engine（数学工坊）

全站支持亮/暗双主题，跟随系统并可在 `/settings` 手动覆盖。
