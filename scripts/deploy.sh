#!/usr/bin/env bash
# 服务器上的一键更新：拉代码 → 重建镜像 → 滚动重启 → 清理旧层。
#
#   ssh root@<host> '/srv/bixuetang/scripts/deploy.sh'
#
# 开机自启不靠这个脚本：docker 服务本身 systemctl enable 过，
# compose 里写了 restart: unless-stopped，机器重启后容器会自己回来。
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/bixuetang}"
cd "$APP_DIR"

echo "==> 拉取代码"
git pull --ff-only

echo "==> 构建镜像（1 核机器上要几分钟，靠 swap 撑过 next build）"
docker compose build

echo "==> 重启服务"
docker compose up -d

echo "==> 清理悬空镜像层"
docker image prune -f >/dev/null

echo "==> 当前状态"
docker compose ps
