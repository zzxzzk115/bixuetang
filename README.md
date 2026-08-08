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
- **坚持**：整套奖励机制照着学习心理学做——即时反馈、目标梯度、间隔重复、
  损失厌恶（连胜与冻结）、变率强化（彩蛋与宝箱），让「今天再看一章」这件事
  尽可能不靠意志力硬撑。

## 亮点

### 站内直接播放 bilibili 公开课

播放器 = [ArtPlayer](https://artplayer.org/) + [dash.js](https://github.com/Dash-Industry-Forum/dash.js)
的组合（此前的自研播放器已退役），服务端把 bilibili 的 DASH 流合成标准 MPD 喂给 dash.js：

- 任何设备轻易播放：MSE / ManagedMediaSource（iOS 17.1+），老设备自动回退渐进 MP4
- 清晰度取决于你自己的账号权限，换清晰度不丢进度；直链过期自动重连
- 弹幕走官方 [artplayer-plugin-danmuku](https://github.com/zloirock/artplayer)
  插件，防重叠、可调不透明度/字号/速度/区域
- CC 字幕是自研 DOM 层，设置仿 bilibili：开「双语」后分别选主/副字幕叠加，
  每条轨可**直接输入时间轴偏移秒数**（如 `0.8`，不再只有 ±0.5 档）;
  **bilibili 英文轨残缺时自动换用仓库里抓好的 YouTube 官方 CC**
- **画中画带字幕**：把视频搬进浮动小窗（Chrome/Edge 的 Document PiP），
  自绘字幕与播放/暂停、音量、进度、CC 开关等控件一并在窗内；字幕字号随窗口
  大小自适应，且与普通模式各存各的
- 章节面板带前端抓帧的缩略图；进度条上标注 UP 主章节与 AI 知识点，`n` 键跳下一讲点
  （章节、笔记这类入口只在全屏时上控制条，窗口态下页面本身已有清单）
- 观看覆盖率 ≥90% 自动完成本集，跳着看也算——学习不是考勤;
  而**每日打卡只需看完一个章节**,长视频不再是负担
- 字幕时间轴按「轨」独立微调(中文对齐、英文慢半秒时只调英文);
  你的校准会作为众包数据,自动帮到下一个看这条轨的人

### 碎片化学习与心理学奖励

- **视频都有章节**：UP 主章节与 AI 知识点标在进度条与章节面板上,任意跳转;
  ≥25 分钟的长视频更进一步——章节成为结算单元,每看完一章立刻拿 XP,
  看一章就算当天打了卡,通勤路上也能啃一段
- **章节连击**：累计每 10 章开金币宝箱、每 25 章送经验药水——间隔不定的惊喜
  比固定工资更让人上头（变率强化）
- **间隔重复**：看完一集，这一集的术语与知识点自动进复习队列，按 SM-2
  简化版调度，第 1/3/7/21 天回来考你
- **连胜与冻结**：连续学习天数可视化；偶尔断一天可用商店里的冻结保住连胜
- **每日 / 每月任务**：今日看一集、清复习、打一场试炼；月度累计任务数达标另有奖。
  奖励里的**时长型经验药水**（全局按时长翻倍）只由任务发放，按次的留给课程通关
- **装备与道具**：遗物加成四维（专注/精准/意志/洞察，直接影响答题限时与提示），
  三件遗物可融合升稀有度；还有**诅咒遗物**（负增益换强效）与**护盾血**（以撒式蓝心，
  答错先扣它）——高风险高回报
- **分集小测验**：看完一集可自愿点开一组四选一巩固题，做对加 XP，但**不在通关路径上**
- **防疲劳**：连续学习时长到点提醒起来活动，别把自己熬垮
- **全屏不打扰**：全屏观看时奖励只在角落出轻量特效，退出全屏再补完整结算

### 学习工具

- **视频笔记**：对任意时间戳记 Markdown 笔记，带工具栏（标题/加粗/列表/代码…）与编辑/预览切换，
  点时间戳跳回原片；全屏内按 `b` 速记，展开笔记自动暂停，记好的笔记可随时编辑
- **术语卷宗**：看完哪一集就解锁哪一集的术语，跨课程标注出处
- **答题 / 试炼 / 幽灵对战**：知识点出题、无限限时挑战、异步排位
- **分享卡**：一键生成带二维码的课程分享图（本站样式 / bilibili 样式）
- **路线地图**：一门课拆成「看视频 / 阶段测验 / 宝箱」多个节点
- **PWA**：可以添加到主屏当 App 用

### 给足 credit

- 播放页直接展示 UP 主头像与昵称，可一键关注（用你自己的 bilibili 账号）
- 每门课带「相关链接」：课程官网（讲义/作业）、bilibili 原视频、社区攻略
- 点赞 / 投币 / 收藏 / 评论都在站内可用——好内容值得三连

### 附属工具（桌面端）

- **Hack 实验室**：nand2tetris 全链路浏览器移植——Jack 编译器 → VM 翻译器 →
  汇编器 → CPU 模拟器 + WebGL 屏幕
- **数学工坊**：公式求值、化简、符号求导与函数图像，全部在本地算

这两个工具依赖键盘和大屏，窄屏下不提供入口。

## 部署

只需要 Docker。用户数据是一个 SQLite 文件，整目录拷走就是完整备份。

镜像由 GitHub Actions 在 `master` 有 push 时自动构建并推到 GHCR
（`ghcr.io/zzxzzk115/bixuetang:latest`）——**服务器只拉镜像、不本地 build**，
小内存/小盘机器也能轻松部署。

```bash
git clone https://github.com/zzxzzk115/bixuetang.git
cd bixuetang
printf 'SITE_DOMAIN=bixuetang.com\n' > .env
docker compose up -d          # 自动 pull 公开镜像并起容器，无需登录
```

访问 `https://bixuetang.com`。Caddy 会在容器里读取 `.env` 的 `SITE_DOMAIN`，自动申请和续期 HTTPS 证书。

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SITE_DOMAIN` | 无 | 生产域名，Caddy 用它监听 80/443 并自动签发 HTTPS 证书 |
| `DATABASE_PATH` | 镜像内 `/data/bixuetang.db` | SQLite 路径，上传的头像存同目录的 `avatars/` |
| `COOKIE_SECURE` | compose 内为 `1` | 会话 cookie 是否仅走 HTTPS。本地开发保持 `0` |
| `PORT` / `HOSTNAME` | `3000` / `0.0.0.0` | 应用容器内部监听地址 |
| `ADMIN_USER_IDS` | 无（退回 id=1） | 管理端 `/admin` 权限，逗号分隔的用户 id，见下「管理员」 |

数据库迁移在服务启动时自动执行，不用手动跑。

### 管理员

管理端 `/admin`（视频失效反馈处理等运营功能）只对管理员可见，非管理员访问 404。
谁是管理员按优先级判定：

1. `ADMIN_USER_IDS`（如 `1,5`）——**首选**，用户 id 不可变、不会被改名或抢注影响；
2. `ADMIN_USERNAMES`（如 `alice`）——兼容用，注意用户名可在设置页修改；
3. 都没配 → 默认首个账号（`id=1`）。

线上务必显式配 `ADMIN_USER_IDS` 指向你本人的号——「谁先注册谁是 id=1」在生产库里未必是站主。查自己的 id（服务器上）：

```bash
docker compose exec bixuetang node -e "const d=require('better-sqlite3')(process.env.DATABASE_PATH||'/data/bixuetang.db');console.table(d.prepare('SELECT id,username FROM users').all())"
```

在服务器 `.env` 里写 `ADMIN_USER_IDS=<你的id>`，`docker compose up -d` 重启生效。

### 反向代理

`docker-compose.yml` 已内置 Caddy 反代：宿主机开放 80/443，应用容器只在 Docker 网络内暴露 3000。服务器上把 `.env` 写成：

```dotenv
SITE_DOMAIN=bixuetang.com
```

然后执行 `docker compose up -d` 即可（首次会自动 pull 镜像）。

### 发布与更新

分支约定：日常开发在 `dev`，要发版时合并到 `master`。**镜像由版本 tag 触发**
（不是每次 push master 都出）。发布一个版本（在 `master` 上）：

```bash
npm run release            # patch，或  npm run release -- minor / -- major
```

`release.sh` 会：跑检查 → 升 `package.json` 版本号 →（`version` 钩子）把
`CHANGELOG.md` 的「未发布」定版为 `[X.Y.Z] - 日期` → 提交并打 `vX.Y.Z` tag → 推送。
CI 在 tag 上构建 `ghcr.io/zzxzzk115/bixuetang:X.Y.Z` + `:latest`，并据 CHANGELOG
生成 GitHub Release。

然后到服务器**手动上线**（保留上线把关，不自动部署）：

```bash
cd /srv/bixuetang && git pull && ./scripts/deploy.sh
```

`deploy.sh`：拉仓库 → `docker compose pull` 拉新镜像 → 滚动重启 → 清理旧层。
**不在服务器上构建**，不吃 `next build` 的内存与磁盘峰值。日常改动记进
[`CHANGELOG.md`](CHANGELOG.md) 的「未发布」段即可。

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
| `npm test` | 纯函数单测（解锁规则、XP、SRS、分段、字幕优选、Markdown、Hack 工具链、数学引擎） |
| `npm run validate` | 校验 `content/`（Zod + 引用完整性 + 仓库字幕） |
| `npm run fetch:episodes` | 从 bilibili 拉真实分集标题写回 YAML |
| `npm run fetch:subtitles -- <courseId>` | 抓 bilibili CC 字幕供 AI 分析定时间戳 |
| `npm run fetch:yt-subs -- <courseId> <playlist>` | 抓 YouTube 官方 CC 入仓库（流程见 CONTRIBUTING） |
| `npm run check:links -- --bili` | 体检所有视频源是否还活着 |
| `npm run brand:gen` | 由 `src/lib/brand/sigil.ts` 重新生成 favicon 与 OG 图 |
| `npm run db:generate` | 改完 `src/lib/db/schema.ts` 后生成迁移 |

## 贡献内容

**内容即代码**：课程、路线、AI 分析、仓库字幕全部在 `content/` 下，改动经 PR 合并、
重新构建镜像后生效，数据库只存用户数据。

字段规范、写作原则和提交流程见 **[CONTRIBUTING.md](./CONTRIBUTING.md)**——
那份文档同时写给人和 AI agent 看，照着填就能加课。

## 技术栈

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
SQLite (better-sqlite3 + Drizzle ORM) · argon2id + cookie session ·
ArtPlayer + dash.js

分享图与章节缩略图用 canvas 现画，二维码编码是本仓库自己实现的。
全站支持亮/暗双主题，跟随系统并可在设置里手动覆盖。

## 致谢

这个项目站在很多人的工作之上：

- **[wiliwili](https://github.com/xfangfang/wiliwili)**（GPL-3.0）——第三方 bilibili 客户端。
  本站「绑定账号 → 官方接口取播放地址与弹幕 → 站内渲染播放 → 拿到真实观看进度」
  这条路线，思路完全来自 wiliwili 的实现。感谢 xfangfang 与其贡献者。
  本项目未使用其代码，仅参考其对公开接口的用法。
- **[csdiy.wiki](https://csdiy.wiki/)**——课程索引的主要来源。这个项目某种意义上
  就是给 csdiy 的课程表加了一套进度追踪和播放器。感谢 PKUFlyingPig 与所有编者。
- **各课程的老师与搬运 UP 主**——内容才是这一切的根。站内展示 UP 主并提供关注入口、
  每门课都链接官网与原视频，请多多三连。
- **[nand2tetris](https://www.nand2tetris.org/)**（Noam Nisan & Shimon Schocken）——
  Hack 实验室的全部理论与规范来自这门课。
- **[3Blue1Brown](https://www.3blue1brown.com/)**——「直觉先行」这条初级线就是他的三部曲。

用到的开源项目：

| 项目 | 用途 |
|---|---|
| [Next.js](https://nextjs.org/) | 应用框架 |
| [ArtPlayer](https://artplayer.org/) | 播放器 UI 与手势/全屏/进度条（自研播放器已退役） |
| [dash.js](https://github.com/Dash-Industry-Forum/dash.js) | DASH/MSE 播放引擎 |
| [artplayer-plugin-danmuku](https://www.npmjs.com/package/artplayer-plugin-danmuku) | 弹幕渲染 |
| [Drizzle ORM](https://orm.drizzle.team/) · [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | 数据层 |
| [MathLive](https://cortexjs.io/mathlive/) · [compute-engine](https://cortexjs.io/compute-engine/) | 数学工坊的公式输入与符号计算 |
| [KaTeX](https://katex.org/) | 知识点里的公式排版 |
| [CodeMirror 6](https://codemirror.net/) | Hack 实验室的代码编辑器 |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | 抓取 YouTube 官方 CC 字幕（本地管线，不随站运行） |
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
  一个 bilibili 账号只能绑定一个必学堂账号，避免扫码登录落到不确定的账号上。
- **与 bilibili 无关**：本站与 bilibili 无任何隶属、合作或授权关系，
  「bilibili」「哔哩哔哩」及相关标识为其权利人所有。
  与其相关的接口调用仅为满足个人学习进度记录之需要，
  **请勿用于批量抓取、绕过平台限制或任何商业用途**，因违规使用造成的后果由使用者自负。
- **按现状提供**：不对可用性与准确性作任何担保。视频源失效、平台接口变更、
  字幕（尤其是平台自动生成的 AI 字幕）内容错误等情况可能随时发生。
- **版权**：课程内容版权归原作者与原平台所有。字幕仅收录各平台公开提供的官方 CC 轨,
  若权利人认为本站的索引或收录方式不妥，请提 issue，我们会立即移除对应条目。
