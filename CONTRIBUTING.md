# 贡献内容

这份文档写给两类读者：想加课的人，和被指派来加课的 AI agent。
两者要求一样——照着字段填，跑通校验，提 PR。

**内容即代码**：所有课程、路线都是 `content/` 下的 YAML，
经 PR 合并、重新构建镜像后生效。数据库只存用户的学习进度，不存内容。

改完必须跑：

```bash
npm run validate    # Zod 校验 + 引用完整性；不通过 CI 会拦
```

---

## 目录结构

```
content/
├── courses/<subject>/<id>.yaml    课程，subject ∈ cs | math | physics | ai
├── paths/<id>.yaml                学习路线
├── analysis/<courseId>.json       AI 生成的知识点与术语（可选，由脚本产出）
└── labs/<labId>.yaml              实验室任务清单
```

---

## 课程 `content/courses/<subject>/<id>.yaml`

```yaml
id: cs61a                      # 全站唯一，小写字母数字连字符，同时是 URL
title: 计算机程序的构造和解释
code: CS 61A                   # 可选，课程代号
institution: UC Berkeley       # 可选
instructor: John DeNero        # 可选
subject: cs                    # cs | math | physics | ai
level: basic                   # basic | intermediate | advanced
tags: [编程入门, Python, SICP]
prerequisites: []              # 前置课程 id，见下方「前置关系」
estimatedHours: 60             # 可选
description: >
  用 Python 讲抽象、递归、解释器……
sources:                       # 至少一个
  - platform: bilibili
    url: https://www.bilibili.com/video/BV1ar4y1x7fw
    uploader: 搬运账号名        # 非官方源必填
    note: 2021 春季版，有 CC 字幕
episodes:                      # 与 episodeCount 二选一
  - n: 1
    title: 1.1 - Introduction
    durationSec: 3120          # 可选，用于算单集 XP
    bvid: BV1xx               # 可选，合集课每集独立稿件时填
notes:                         # 可选，笔记/讲义外链
  - title: 课程官网
    url: https://cs61a.org/
lab: hack                      # 可选，关联实验室
```

### 硬性规则

**BV 号必须核实。** 写进 YAML 前用这个接口确认标题对得上：

```
https://api.bilibili.com/x/web-interface/view?bvid=<BV号>
```

搜索结果里 BV 号张冠李戴非常常见。**宁可没有源，也不要挂错课**——
挂错的源比没有源更糟，用户点进去看到的是完全无关的视频。

**分集标题不用手写。** 填好 `sources` 后跑：

```bash
npm run fetch:episodes -- <courseId>
```

会从 bilibili 拉真实的分集标题与时长写回 YAML，多 P 与合集两种结构都支持。

**替代课要标明。** 找不到原课录像时可以挂同主题的替代课或中文对应课，
但 `note` 里必须写清楚它不是原课搬运，别让人以为在看 MIT 的课。

**优先官方源。** 3Blue1Brown、跟李沐学AI 这类有官方账号的，用官方账号的稿件。
搬运号必须填 `uploader`，并在 `note` 里写字幕质量与版本年份。

### 前置关系（`prerequisites`）

这是整个解锁网络的骨架，填之前先想清楚：

- 门槛是**学完**前置课才解锁后续课，不是学一半。填前置等于说
  「不学完这门，后面那门看不懂」——只在真是这样时才填。
- **别为了「更严谨」堆前置**。116 门课里目前只有 8 门没有前置，
  链条已经偏深了。每加一层前置，就多挡住一批人。
- 循环前置会被校验拦下；指向不存在的课程会被忽略并告警。

---

## 路线 `content/paths/<id>.yaml`

```yaml
id: coding-start
title: 编程启程
subject: cs
tier: basic                    # basic | intermediate | advanced
description: >
  写代码的地基线，三门课都没有任何前置，今天就能开始。
stages:
  - title: 第一章 · 先看见全景
    courses: [cs50]
  - title: 第二章 · 补上工具课
    courses: [missing-semester]
```

### 分层规则

`tier` 不只是标签，`basic` 有一条**硬约束**：

> **初级线的首课不能有任何前置。**

它是整个解锁网络的入口。一条 `tier: basic` 但首课需要前置的线，
新人点进去只会看到一屏的锁——那这条线就没有存在的意义。

中级/高级线的解锁只看它**自己首课**的前置，不是「走完整条初级线」。

### 一条线该多长

一条线应该难度一致。从零基础横跨到博士级的长线要拆开——
`cs-core` 原本从 CS50 一路排到分布式系统，既是初级又是高级，
后来拆成了「编程启程（basic）」和「计算机科学主线（intermediate）」。

同一门课可以出现在多条线里，不必去重。

---

## AI 分析 `content/analysis/<courseId>.json`

由 `.claude/skills/analyze-course` 技能生成，一般不手写。结构：

```jsonc
{
  "courseId": "cs61a",
  "generatedAt": "2026-08-04",
  "model": "claude-opus-4",
  "sourceIndex": 0,              // 时间戳基于 sources[i]
  "basis": "subtitles",          // subtitles | titles-only（无字幕时降级）
  "overview": "整门课在讲……",
  "episodes": [
    {
      "n": 1,
      "summary": "这一集在讲……",
      "keyPoints": [
        { "t": 312, "title": "抽象屏障", "detail": "……", "formula": "f(x)=…" }
      ],
      "terms": [
        { "term": "abstraction barrier 抽象屏障", "definition": "分隔程序各层……" }
      ]
    }
  ]
}
```

`terms` 直接决定卷宗——**用户看完第 n 集，就解锁这一集 `terms` 里的词**。
所以术语要挂在真正讲到它的那一集上，不要一股脑堆在第 1 集。

`t` 是秒数，点击可跳转播放器。没有字幕时 `basis` 填 `titles-only` 并省略 `t`。

---

## 字幕与时间戳:bilibili 无 CC 时走 YouTube 官方 CC

不少课在 bilibili 的搬运/官方号上**没有 CC 字幕轨**(硬字幕不算)。若原作者在
YouTube 有官方 CC,可以补两样东西:仓库字幕轨 + 分析时间戳。管线:

```bash
npm run fetch:yt-subs -- <courseId> <YouTube播放列表URL> [--map=01:1,05:5]
```

脚本会自动做三件事:

1. **逐集核对时长**:比对 YouTube 与 bilibili 源(YAML `sources[0]`)的视频时长,
   差超过 3 秒 = 不同剪辑版本,**该集直接跳过**——错位的时间轴不如没有。
   这是硬性规则:时间戳只在两边同一份渲染时才可信。
2. **抓字幕**:优先人工 CC(`en`),抓不到退自动轨(`en-orig`,产物会标 `ai`)。
   **抓取只在本地跑**——YouTube/bilibili 都拦数据中心 IP,别把这步塞进 CI。
3. **转换入库**:
   - `content/subtitles/<courseId>/<n>.json` → 播放器多出一条可开关的 CC 轨
     (哪怕只有英文也多一种选择);格式 `{lan, lanDoc, ai, cues:[{from,to,text}]}`;
   - `scratch/subtitles/<courseId>/<n>.txt` → 90 秒摘要,供 AI 分析定 `t`。

CI 侧的校验是全自动的:`npm run validate` 会检查仓库字幕的 schema、
集号对应课程存在、cues 时间轴单调——**生成在本地,验证在 CI**。

依赖:`pip install yt-dlp`(建议同机有 node 供 `--js-runtimes`)。

---

## 实验室任务 `content/labs/<labId>.yaml`

```yaml
lab: math                      # 目前只有 hack | math
tasks:
  - id: symbolic-derivative     # 与 lab 组合成幂等键，改名等于重置所有人的完成状态
    title: 符号求导
    xp: 40
    description: 成功完成一次符号求导
```

`id` 一旦发布就别改——它是幂等键，改了等于让所有人重新做一遍。

---

## 提交前检查

```bash
npm run validate                  # 必跑
npm run check:links -- --bili     # 改了视频源时跑，确认稿件还活着
npm test                          # 改了 src/ 时跑
```

PR 描述里写清楚：加了什么课/路线、视频源是官方还是搬运、BV 号核实过没有。

---

## 给 AI agent 的额外提醒

- **不要编造 BV 号。** 你没有真正访问过的 BV 号一律不要写进 YAML。
  无法核实时把 `sources` 留空，在 PR 里说明需要人工补充。
- **不要编造课程内容。** `description`、`note`、AI 分析里的知识点都必须
  基于你实际读到的材料（课程官网、字幕、稿件简介），不要凭课名想象。
- **前置关系宁少勿多。** 见上文——每多一层前置就多挡住一批人，
  而你并不承担被挡住的那个人的挫败感。
- 拿不准的地方，在 PR 里写明「这一条我不确定」，比悄悄填一个看起来合理的值好。
