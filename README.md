# 必学堂

游戏闯关式理科自学网站：把 bilibili / YouTube 上的世界名校公开课整理成「副本」，
看完一集击败一只小怪，通关一门课讨伐 Boss，升级攒技能点、点亮技能树、转职换称号。
面向中文母语学习者。课程来源以 [csdiy.wiki](https://csdiy.wiki/) 与 MIT OCW / GAMES 系列为主。

**当前内容量**：116 门课程 · 18 条冒险路径 · 58 个技能节点 · 31 个职业。

## 玩法概念

| 游戏概念 | 对应现实 |
|---|---|
| 副本 | 一门公开课（多视频源：bilibili / YouTube） |
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

## 本地开发

```bash
npm install
npm run dev        # 启动时自动建库迁移，DB 在 ./data/dev.db
```

访问 http://localhost:3000。需要配置时把 `.env.example` 复制为 `.env.local`，
不配也能跑（全部有默认值）。

## 部署

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATABASE_PATH` | `./data/dev.db`（镜像内 `/data/bixuetang.db`） | SQLite 文件路径。上传的头像存在同目录的 `avatars/` 下 |
| `COOKIE_SECURE` | `0` | 会话 cookie 是否仅在 HTTPS 下发送。**生产必须设为 `1`** |
| `PORT` / `HOSTNAME` | `3000` / `0.0.0.0` | 监听地址，镜像里已设好 |
| `BILI_SESSDATA` | 空 | 仅内容维护脚本抓字幕用，站点运行不需要 |

迁移由 `instrumentation.ts` 在服务启动时自动执行，不用手动跑。

### 方式一：Docker Compose（推荐）

```bash
docker compose up -d --build
```

访问 http://localhost:3000。数据持久化在 `bixuetang-data` 卷。
**反代终止 TLS 时**，把 `docker-compose.yml` 里的 `COOKIE_SECURE` 改成 `"1"` 再重启，
否则登录 cookie 会以明文传输。

### 方式二：裸机 Node

需要 Node 22+。构建产物是 Next.js standalone，`npm run serve` 会把它连同
`content/`、`drizzle/`、静态资源一起装配到 `.runtime/` 再启动
（装配到独立目录是为了避开旧进程占用 `.next` 导致的 EBUSY）。

```bash
npm ci
npm run build
DATABASE_PATH=/var/lib/bixuetang/bixuetang.db COOKIE_SECURE=1 npm run serve
```

配合 systemd 常驻：

```ini
[Unit]
Description=bixuetang
After=network.target

[Service]
WorkingDirectory=/srv/bixuetang
Environment=NODE_ENV=production
Environment=DATABASE_PATH=/var/lib/bixuetang/bixuetang.db
Environment=COOKIE_SECURE=1
ExecStart=/usr/bin/npm run serve
Restart=always
User=bixuetang

[Install]
WantedBy=multi-user.target
```

### 反向代理

应用不自己处理 TLS，前面挂 Caddy 或 Nginx。Caddy 两行搞定：

```caddyfile
bixuetang.example.com {
    reverse_proxy localhost:3000
}
```

Nginx 需要注意上传头像的体积上限（默认 1 MB 够用，但别设成 0）：

```nginx
server {
    server_name bixuetang.example.com;
    client_max_body_size 2m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 备份与升级

用户数据只有一个 SQLite 文件和同目录的 `avatars/`，整个目录拷走就是完整备份。
SQLite 开了 WAL，**别直接 `cp` 正在写的库**，用官方备份命令：

```bash
docker compose exec bixuetang sh -c 'sqlite3 /data/bixuetang.db ".backup /data/backup.db"'
docker compose cp bixuetang:/data/backup.db ./bixuetang-backup.db
docker compose cp bixuetang:/data/avatars ./avatars-backup
```

升级就是重新构建镜像——内容即代码，课程改动随镜像发布：

```bash
git pull && docker compose up -d --build
```

数据库迁移在启动时自动执行，无需停机手动操作。回滚到旧镜像前请确认
新版本没有引入不兼容的迁移（`drizzle/` 下的 SQL 只增不改字段时可安全回滚）。

## 常用命令

```bash
npm test              # 纯函数单测（游戏机制 + Hack 工具链 + 数学引擎）
npm run validate      # 校验 content/（Zod + 引用完整性 + DAG 环检测）
npm run fetch:episodes  # 从 bilibili API 拉取各课真实分集标题写回 YAML
npm run check:links -- --bili   # 体检所有视频源是否还活着
npm run brand:gen     # 由 src/lib/brand/sigil.ts 的像素网格重新生成 favicon 与 OG 图
npm run db:generate   # 修改 src/lib/db/schema.ts 后生成迁移
```

## 添加课程

在 `content/courses/<subject>/` 下新建 YAML（字段见 `src/lib/content/schema.ts`），
跑 `npm run validate` 通过即可。原则：

- 视频源优先官方账号（3B1B、跟李沐学AI 等），搬运号标注 `uploader`，`note` 写字幕质量与版本年份
- **BV 号必须核实**：写进 YAML 前用 `https://api.bilibili.com/x/web-interface/view?bvid=<BV>`
  确认标题与课程对得上。搜索结果里的 BV 号张冠李戴很常见，宁可没有源也不要挂错课。
- 找不到原课录像时，可以挂**同主题替代课或中文对应课**，但 `note` 里必须写明它不是原课搬运
- 一门课至少一个 `sources`；bilibili `/video/BVxxx` 与 YouTube watch/playlist 链接可内嵌播放，其他链接自动降级为外链卡片
- 笔记外链放 `notes`，学习路径在 `content/paths/`，技能树 `content/skill-tree.yaml`，职业 `content/jobs.yaml`
- 分集标题不用手写，`npm run fetch:episodes` 会从 bilibili 拉真实的（多 P 与合集两种结构都支持）

内容即代码：改动经 PR 审阅合并，重新构建镜像后生效。数据库只存用户数据。

## 技术栈

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
SQLite (better-sqlite3 + Drizzle ORM) · argon2id + cookie session ·
CodeMirror 6（Hack 实验室编辑器）· MathLive + compute-engine（数学工坊）

播放器、弹幕渲染与二维码编码都是本仓库自己实现的，没有引入第三方播放器/QR 依赖。

全站支持亮/暗双主题，跟随系统并可在 `/settings` 手动覆盖。

## 致谢

- **[wiliwili](https://github.com/xfangfang/wiliwili)**（GPL-3.0）——第三方 bilibili 客户端。
  本站的「绑定 bilibili 账号 → 官方接口取播放地址与弹幕 → 自己渲染播放器 → 拿到真实观看
  进度」这条路线，思路来自 wiliwili 的实现。感谢 xfangfang 与其贡献者。
  本项目未使用其代码，仅参考其对公开接口的用法。
- 课程索引主要来自 [csdiy.wiki](https://csdiy.wiki/)。
- 像素字体：[方舟像素字体](https://github.com/TakWolf/ark-pixel-font)（OFL-1.1）。
  美术素材授权见 `public/assets/ATTRIBUTION.md`。

## 许可与免责声明

本项目以 [GNU General Public License v3.0](./LICENSE) 开源——与思路来源
[wiliwili](https://github.com/xfangfang/wiliwili) 保持一致的许可与免责立场。

- **非商业、无盈利**：本站不售卖课程内容，不提供付费会员，站内「金币 / 药水 / 商店」
  全部是学习进度换算出的游戏化数值，与真实货币无关。若未来接受赞助，赞助仅用于
  服务器与域名开销，不解锁任何内容特权。
- **不托管视频**：所有课程视频均来自 bilibili / YouTube 等平台的公开地址，
  本站不存储、不转码、不二次分发视频文件。绑定账号后的播放走用户自己的账号凭据，
  等同于用户在原平台观看；凭据只保存在本站服务端，用户可随时解绑删除。
- **接口用途**：与 bilibili 相关的接口调用仅为满足本人学习进度记录之需要，
  请勿用于批量抓取、绕过平台限制或任何商业用途。因使用者违规使用造成的后果自负。
- 课程内容版权归原作者与原平台所有。若权利人认为本站的索引方式不妥，
  请提 issue，我们会立即移除对应条目。
