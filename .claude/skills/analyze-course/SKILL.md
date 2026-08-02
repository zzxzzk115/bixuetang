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

2. **拉字幕**（存 scratchpad，勿入仓库）：
   - **YouTube**：`yt-dlp --skip-download --write-subs --write-auto-subs
     --sub-langs "zh.*,en" -o "<scratch>/%(playlist_index)s.%(ext)s" <播放列表URL>`
     （yt-dlp 未安装则 `pip install yt-dlp` 或 winget；网络不通再走降级）。
   - **B 站**：见 `reference.md` 的 CC 字幕 API 两步流程。
   - vtt/字幕 JSON 解析要点也在 `reference.md`。

3. **无字幕降级**：任何源都拿不到字幕时，改为基于「集标题 + 课程官网
   syllabus/讲义目录 + 你对这门课的可靠知识」生成，此时：
   - `basis: "titles-only"`，keyPoints 一律**不带 `t`**；
   - 不确定的内容宁可少写，禁止编造时间戳。

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

- 时间戳必须来自字幕数据，宁缺毋滥；titles-only 模式绝不写 `t`。
- JSON 文件用 UTF-8（无 BOM）；文件名必须等于 courseId。
- 不改动课程 YAML 本身；分析是纯附加数据。
