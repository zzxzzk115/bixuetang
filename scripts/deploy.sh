#!/usr/bin/env bash
# 服务器一键更新（免本地构建）：拉取 CI 已构建好的镜像 → 滚动重启。
#
#   ssh root@<host> '/srv/bixuetang/scripts/deploy.sh'
#
# 镜像由 GitHub Actions 在 master push 时构建并推到 GHCR
# (ghcr.io/zzxzzk115/bixuetang:latest)，服务器上不再跑 npm build，省盘省内存。
#
# 首次需在服务器登录 GHCR（私有包才需要；若把该 package 设为 public 可跳过）：
#   echo <GHCR_PAT> | docker login ghcr.io -u zzxzzk115 --password-stdin
#   PAT 只需勾选 read:packages 权限。
#
# 开机自启不靠这个脚本：compose 里 restart: unless-stopped，机器重启容器自会回来。
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/bixuetang}"
cd "$APP_DIR"

echo "==> 拉取仓库(只为更新 compose / 脚本 / .env 变更，不构建代码)"
git pull --ff-only

echo "==> 拉取最新镜像"
docker compose pull

echo "==> 滚动重启"
docker compose up -d

echo "==> 清理悬空旧镜像层"
docker image prune -f >/dev/null

echo "==> 当前状态"
docker compose ps
