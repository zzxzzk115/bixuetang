---
name: analyze-course
description: 为 guild 课程生成 AI 知识点分析（时间轴/摘要/术语），产出 content/analysis/<courseId>.json。用法：/analyze-course <courseId> [集数范围]。触发词：分析课程 / 生成知识点 / 课程时间轴。
---

# 课程视频分析管线

为指定课程逐集生成结构化知识点，写入 `content/analysis/<courseId>.json`，
schema 见 `src/lib/content/schema.ts` 的 `CourseAnalysisSchema`。

## 流程

1. **读课程定义**：在 `content/courses/**/` 找到 `<courseId>.yaml`，取 `sources`
   与 `episodes` 清单。选定 `sourceIndex`：优先选有完整分 P/播放列表、且时间轴
   将来能对上的源（官方源优先）。

2. **拉字幕**（存 scratch/，勿入仓库）：
   - **B 站**：直接跑 `npm run fetch:subtitles -- <courseId>`。需要 `.env.local` 里的
     `BILI_SESSDATA`（游客态拿不到字幕列表）；脚本顶部注释写了怎么取。
     产物：`scratch/subtitles/<courseId>/<n>.json`（逐字原文）与 `<n>.txt`（**分析读这个**）。
     `.txt` 每行形如 `[12:30|750s] 这 90 秒在讲的内容…`，**方括号里的秒数直接就是 `t`**。
   - 不确定哪些课有 CC 字幕时先普查：`npm run fetch:subtitles -- --probe`
     （每门课抽第 1 集，报告有无字幕）。全站约 7 成课程有 AI 中文字幕。
   - **YouTube**：`yt-dlp --skip-download --write-subs --write-auto-subs
     --sub-langs "zh.*,en" -o "<scratch>/%(playlist_index)s.%(ext)s" <播放列表URL>`
     （yt-dlp 未安装则 `pip install yt-dlp` 或 winget）。vtt 解析要点见 `reference.md`。

3. **无字幕降级**：确认拿不到字幕时（`--probe` 显示无 CC、或该课只有硬字幕），
   改为基于「集标题 + 课程官网 syllabus/讲义目录 + 你对这门课的可靠知识」生成：
   - `basis: "titles-only"`，keyPoints 一律**不带 `t`**；
   - 不确定的内容宁可少写，禁止编造时间戳。

   注意 B 站的 AI 字幕是**无标点的 ASR 流**，含大量「这个这个这个」之类口水话，
   人名/专有名词常被听错。据此判断讲了什么是可靠的，但**别把 ASR 原文当引文抄进 detail**。

4. **分集提炼**：每集产出——
   - `summary`：3–5 句中文摘要；
   - `keyPoints`：3–8 条，`title` 短语 + `detail` 一两句；有字幕时 `t` 取该知识点
     首次出现的字幕句起始秒（整数即可）；数学/物理公式写进 `formula`（LaTeX，
     不带 `$` 定界符），供数学工坊联动；
   - `terms`：中英术语对照 0–6 条。
   - 长课分批处理，中间产物写 scratchpad，全部完成后再汇总成最终 JSON。

5. **写文件并自检**：写 `content/analysis/<courseId>.json`
   （`generatedAt` 用今天日期，`model` 写你的模型 id），然后跑
   `npm run validate`；报错则按错误信息修正重写，直到通过。

6. **汇报**：集数覆盖率、basis、是否有集因无字幕被降级。

## 硬性约束

- 时间戳必须来自字幕数据（`.txt` 行首那个秒数），宁缺毋滥；titles-only 模式绝不写 `t`。
- `sourceIndex` 要指向**实际抓字幕的那个源**在 YAML `sources` 里的下标，否则时间轴对不上。
- JSON 文件用 UTF-8（无 BOM）；文件名必须等于 courseId。
- 不改动课程 YAML 本身；分析是纯附加数据。
