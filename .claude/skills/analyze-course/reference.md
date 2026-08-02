# 字幕获取技术细节

## B 站 CC 字幕（两步 API）

1. 拿分 P 列表与 cid：
   `GET https://api.bilibili.com/x/web-interface/view?bvid=<BV>`（av 号用 `aid=<数字>`）
   → `data.pages[]`：每项 `{ cid, page, part(标题), duration }`。

2. 逐 P 拿字幕地址：
   `GET https://api.bilibili.com/x/player/wbi/v2?bvid=<BV>&cid=<cid>`
   → `data.subtitle.subtitles[]`：每项 `{ lan, subtitle_url }`（协议相对地址，补 https:）。
   优先 `lan` 为 `zh-CN`/`zh-Hans`，其次 `ai-zh`（AI 字幕），再次 `en`。

3. `subtitle_url` 返回 JSON：`{ body: [{ from(起始秒,浮点), to, content }] }`
   —— `from` 就是 keyPoints 的 `t` 来源。

注意：
- 请求带 UA 头（裸 fetch 可能 412）：`User-Agent: Mozilla/5.0`、`Referer: https://www.bilibili.com`。
- 很多搬运视频没有 CC 字幕（`subtitles` 为空数组）→ 试 yt-dlp（对 B 站也支持
  `--write-subs`），仍无则走降级。
- wbi 接口偶尔要签名；若 412/错误，退回旧接口
  `https://api.bilibili.com/x/player/v2?bvid=&cid=`（字段相同）。

## YouTube（yt-dlp）

```bash
yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs "zh.*,en" \
  --sub-format vtt -o "<scratch>/%(playlist_index)02d.%(ext)s" "<playlist_url>"
```

- 人工字幕（`--write-subs`）优先于自动字幕（`--write-auto-subs`）。
- 单视频源没有 playlist_index，用 `%(id)s` 命名。

## VTT 解析要点

- cue 形如 `00:01:23.456 --> 00:01:26.000`，起始时间转秒取整。
- 自动字幕的滚动重复：相邻 cue 文本大量重叠，去重后再喂模型
  （按行去重即可，别逐词 diff）。
- 一集字幕全文可能 2–5 万字，超长时按 10 分钟窗口分段提炼再合并。
