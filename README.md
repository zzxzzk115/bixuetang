<div align="center">

# 必学堂

**把公开课学成通关**

一个游戏化的公开课自学工具。把 bilibili / YouTube 上的世界名校公开课
整理成有先后顺序的学习路线，看完一集打一个勾，攒经验、开新线、解锁词条。

面向中文母语学习者。课程索引主要来自 [csdiy.wiki](https://csdiy.wiki/)。

[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](./LICENSE)

</div>

---

## 它解决什么问题

公开课资源从来不缺，缺的是**顺序**和**坚持**。

- **顺序**：116 门课按前置关系连成 21 条路线，分初级/中级/高级。前置课没学完，
  后续课就锁着——不是为了刁难，是因为跳过去也看不懂。三条初级线的首课没有任何前置，
  任何人打开就能学。
- **坚持**：每集打卡给经验，连续学习有连胜，看完一集会弹出这一集新解锁的术语。
  进度按「实际看了视频的百分之多少」自动记，不靠手动勾选。

## 主要功能

### 自研 bilibili 播放器

绑定 bilibili 账号后视频在站内直接播放，不跳转、不套 iframe：

- DASH 画音分离双轨同步，清晰度取决于你自己的账号权限
- 弹幕在 canvas 自绘，可调不透明度 / 字号 / 速度 / 显示区域 / 分类屏蔽
- CC 字幕多语言叠加（中英对照），可调字号、位置、描边样式，还能按视频校准时间轴
- 点赞 / 投币 / 收藏 / 评论，未登录时禁用并提示
- 键盘全套快捷键；手机上横滑快退快进、纵滑调音量、双击暂停、长按 2 倍速
- 观看覆盖率 ≥90% 自动打卡，跳着看也算——学习不是考勤

### 学习进度

- **路线地图**：一门课拆成「看视频 / 阶段测验 / 宝箱」多个节点，每 4 集一个节点
- **术语卷宗**：看完哪一集就解锁哪一集的术语；一个词出现在多门课里时，
  只标注你已经看过的那些出处
- **答题与试炼**：课程测验用课程自己的知识点出题，试炼是无限限时挑战
- **PWA**：可以添加到主屏，当 App 用

### 附属工具（桌面端）

- **Hack 实验室**：nand2tetris 全链路浏览器移植——Jack 编译器 → VM 翻译器 →
  汇编器 → CPU 模拟器 + WebGL 屏幕
- **数学工坊**：公式求值、化简、符号求导与函数图像，全部在本地算

这两个工具依赖键盘和大屏，窄屏下不提供入口。

## 部署

只需要 Docker。用户数据是一个 SQLite 文件，整目录拷走就是完整备份。

```bash
git clone https://github.com/zzxzzk115/bixuetang.git
cd bixuetang
printf 'SITE_DOMAIN=bixuetang.com\n' > .env
docker compose up -d --build
```

访问 `https://bixuetang.com`。Caddy 会在容器里读取 `.env` 的 `SITE_DOMAIN`，自动申请和续期 HTTPS 证书。

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SITE_DOMAIN` | 无 | 生产域名，Caddy 用它监听 80/443 并自动签发 HTTPS 证书 |
| `DATABASE_PATH` | 镜像内 `/data/bixuetang.db` | SQLite 路径，上传的头像存同目录的 `avatars/` |
| `COOKIE_SECURE` | compose 内为 `1` | 会话 cookie 是否仅走 HTTPS。本地开发保持 `0` |
| `PORT` / `HOSTNAME` | `3000` / `0.0.0.0` | 应用容器内部监听地址 |

数据库迁移在服务启动时自动执行，不用手动跑。

### 反向代理

`docker-compose.yml` 已内置 Caddy 反代：宿主机开放 80/443，应用容器只在 Docker 网络内暴露 3000。服务器上把 `.env` 写成：

```dotenv
SITE_DOMAIN=bixuetang.com
```

然后执行 `docker compose up -d --build` 即可。

### 更新

```bash
./scripts/deploy.sh
```

拉代码 → 重建镜像 → 滚动重启 → 清理旧层。小内存机器（1G）要先开 2G swap，
否则 `next build` 会 OOM。

### 备份

```bash
docker compose exec bixuetang sh -c 'sqlite3 /data/bixuetang.db ".backup /data/backup.db"'
docker compose cp bixuetang:/data/backup.db ./backup.db
```

SQLite 开了 WAL，**别直接 cp 正在写的库**。

## 本地开发

需要 Node 22+。

```bash
npm install
npm run dev        # 启动时自动建库迁移，DB 在 ./data/dev.db
```

| 命令 | 作用 |
|---|---|
| `npm test` | 纯函数单测（解锁规则、XP、题库、Hack 工具链、数学引擎） |
| `npm run validate` | 校验 `content/`（Zod + 引用完整性） |
| `npm run fetch:episodes` | 从 bilibili 拉真实分集标题写回 YAML |
| `npm run check:links -- --bili` | 体检所有视频源是否还活着 |
| `npm run brand:gen` | 由 `src/lib/brand/sigil.ts` 重新生成 favicon 与 OG 图 |
| `npm run db:generate` | 改完 `src/lib/db/schema.ts` 后生成迁移 |

## 贡献内容

**内容即代码**：课程、路线全部是 `content/` 下的 YAML，改动经 PR 合并、
重新构建镜像后生效，数据库只存用户数据。

字段规范、写作原则和提交流程见 **[CONTRIBUTING.md](./CONTRIBUTING.md)**——
那份文档同时写给人和 AI agent 看，照着填就能加课。

## 技术栈

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
SQLite (better-sqlite3 + Drizzle ORM) · argon2id + cookie session

播放器、弹幕渲染、二维码编码都是本仓库自己实现的，没有引入第三方播放器或 QR 依赖。

全站支持亮/暗双主题，跟随系统并可在设置里手动覆盖。

## 致谢

这个项目站在很多人的工作之上：

- **[wiliwili](https://github.com/xfangfang/wiliwili)**（GPL-3.0）——第三方 bilibili 客户端。
  本站「绑定账号 → 官方接口取播放地址与弹幕 → 自己渲染播放器 → 拿到真实观看进度」
  这条路线，思路完全来自 wiliwili 的实现。感谢 xfangfang 与其贡献者。
  本项目未使用其代码，仅参考其对公开接口的用法。
- **[csdiy.wiki](https://csdiy.wiki/)**——课程索引的主要来源。这个项目某种意义上
  就是给 csdiy 的课程表加了一套进度追踪和播放器。感谢 PKUFlyingPig 与所有编者。
- **[nand2tetris](https://www.nand2tetris.org/)**（Noam Nisan & Shimon Schocken）——
  Hack 实验室的全部理论与规范来自这门课。
- **[3Blue1Brown](https://www.3blue1brown.com/)**——「直觉先行」这条初级线就是他的三部曲。

用到的开源项目：

| 项目 | 用途 |
|---|---|
| [Next.js](https://nextjs.org/) | 应用框架 |
| [Drizzle ORM](https://orm.drizzle.team/) · [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | 数据层 |
| [MathLive](https://cortexjs.io/mathlive/) · [compute-engine](https://cortexjs.io/compute-engine/) | 数学工坊的公式输入与符号计算 |
| [KaTeX](https://katex.org/) | 知识点里的公式排版 |
| [CodeMirror 6](https://codemirror.net/) | Hack 实验室的代码编辑器 |
| [lucide](https://lucide.dev/) | 图标 |
| [Zod](https://zod.dev/) | 内容 schema 校验 |
| [@node-rs/argon2](https://github.com/napi-rs/node-rs) | 密码哈希 |

## 许可与免责声明

本项目以 [GNU General Public License v3.0](./LICENSE) 开源——与思路来源
[wiliwili](https://github.com/xfangfang/wiliwili) 保持一致的许可与免责立场。

- **非商业、无盈利**：本站不售卖课程内容，不提供付费会员。站内「金币 / 药水 / 商店」
  全部是学习进度换算出的虚拟数值，不能充值、不能提现、与真实货币无关。
  若未来接受赞助，赞助仅用于服务器与域名开销，不解锁任何内容特权。
- **不托管视频**：所有课程视频均来自 bilibili / YouTube 等平台的公开地址，
  本站不存储、不转码、不二次分发视频文件。绑定账号后的播放走用户自己的账号凭据，
  等同于用户在原平台观看；凭据只保存在本站服务端，可随时解绑删除。
- **与 bilibili 无关**：本站与 bilibili 无任何隶属、合作或授权关系，
  「bilibili」「哔哩哔哩」及相关标识为其权利人所有。
  与其相关的接口调用仅为满足个人学习进度记录之需要，
  **请勿用于批量抓取、绕过平台限制或任何商业用途**，因违规使用造成的后果由使用者自负。
- **按现状提供**：不对可用性与准确性作任何担保。视频源失效、平台接口变更、
  字幕（尤其是平台自动生成的 AI 字幕）内容错误等情况可能随时发生。
- **版权**：课程内容版权归原作者与原平台所有。若权利人认为本站的索引方式不妥，
  请提 issue，我们会立即移除对应条目。
