# Showcase capture

Captured on 2026-10-16 in a newly created independent workspace. Source checkout: `23e51a736ce867f9c3b33b83a1b24eb1a1e3101f`.

本次使用官方 `ghcr.io/zzxzzk115/bixuetang` Docker 镜像，在新建目录与空 SQLite 数据库中运行。没有连接线上服务或使用真实学员数据。

```sh
mkdir -p demo-data
# 确保目录可由容器内 UID 1001 写入。
docker run --rm --name bixuetang-preview -p 127.0.0.1:4332:3000 \
  -v "$PWD/demo-data:/data" -e DATABASE_PATH=/data/showcase.db \
  -e COOKIE_SECURE=0 -e ADMIN_INITIAL_PASSWORD=local-preview-only \
  ghcr.io/zzxzzk115/bixuetang@sha256:79ec89cd943ff839886d0418e3a5465316e9b7b3fd06208e04f19bd47fb40d56
```

在该本地实例中创建仅用于展示的学员 `showcase`（昵称“演示学员”），登录后在欢迎界面选择“先逛逛”。截图展示智能启程路线初始状态；所有进度均为演示数据。截图保留应用本身的样式，未额外添加浏览器外壳、圆角卡片或装饰边框。

镜像中的应用版本为 0.5.1。截图并非证明此 checkout 的生产构建结果；这里仅新增 README 图片与复现说明。
