# 更新日志

本项目的所有重要变更都记录在此。格式参考
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),
版本遵循[语义化版本](https://semver.org/lang/zh-CN/)。

发布流程见 README「发布」一节:`scripts/release.sh` 会把下面的
`[未发布]` 内容定版、打 tag,CI 据此出镜像并生成 GitHub Release。

## [未发布]

### 新增
- 英语影子跟读三分级线(影读启声/循声/化境)+ 逐句练习(录音自比、波形、无 AI),
  含解锁门槛与「跟读片段」进度。
- 历史学科线:溯古华夏 / 近代风云 / 大国之路(真视频纪录片,按朝代覆盖),
  各课带知识点卷宗。
- 设置页「关于」板块:GitHub 仓库 / 提 Issue / Star。
- CI 出镜像 + 服务器免 build 拉取部署(GHCR),版本号管理与本 CHANGELOG。

### 优化
- 出题质量:干扰项改为「同课优先→同学科→兜底」,相关而易混;复习卡加「课程·第 N 集」上下文。

### 修复
- 跟读首句播放不跳转(等 DASH seek 就位再 play)。
- dashjs CMCD 遥测对相对 BaseURL 构造 URL 报错刷屏(两个播放器关闭 CMCD)。
