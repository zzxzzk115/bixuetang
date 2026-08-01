# 学者公会 Guild

游戏闯关式理科自学网站：把 bilibili / YouTube 上的世界名校公开课整理成「副本」，
看完一集击败一只小怪，通关一门课讨伐 Boss，升级攒技能点、点亮技能树、转职换称号。
面向中文母语学习者。

## 玩法概念

| 游戏概念 | 对应现实 |
|---|---|
| 副本 | 一门公开课（多视频源：B 站 / YouTube） |
| 小怪 | 一集视频，勾选即击败，+XP |
| Boss | 整课全部集数看完，触发通关结算奖励 |
| 冒险路径 | 由浅入深的学习路线（分章节） |
| 技能树 | 理科知识 DAG，完成课程 + 花技能点点亮（开发中） |
| 转职 | 一转选学徒方向，二转细分/兼修复合职业（开发中） |

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
npm test           # 游戏机制纯函数单测（node --test）
npm run validate   # 校验 content/ 内容（Zod + 引用完整性 + DAG 环检测）
npm run db:generate  # 修改 src/lib/db/schema.ts 后生成迁移
```

## 添加课程

在 `content/courses/<subject>/` 下新建 YAML（字段见 `src/lib/content/schema.ts`），
跑 `npm run validate` 通过即可。原则：

- 视频源优先官方账号（3B1B、跟李沐学AI 等），搬运号标注 `uploader`，`note` 写字幕质量与版本年份
- 一门课至少一个 `sources`；B 站 `/video/BVxxx` 与 YouTube watch/playlist 链接可内嵌播放，其他链接自动降级为外链卡片
- 笔记外链放 `notes`，学习路径在 `content/paths/`，技能树 `content/skill-tree.yaml`，职业 `content/jobs.yaml`

内容即代码：改动经 PR 审阅合并，重新构建镜像后生效。数据库只存用户数据。

## 技术栈

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
SQLite (better-sqlite3 + Drizzle ORM) · argon2id + cookie session
