#!/usr/bin/env bash
# 发布一个新版本:检查 → 升版本号(自动把 CHANGELOG「未发布」定版 + 打 tag)→ 推送。
# 推送 tag 后 CI 会:构建带版本号的镜像、推 GHCR(:X.Y.Z + :latest)、生成 GitHub Release。
# 部署仍是手动一步:之后到服务器 `./scripts/deploy.sh` 拉取(保留上线把关)。
#
#   pnpm release            # patch:  x.y.Z
#   pnpm release minor      # minor:  x.Y.0
#   pnpm release major      # major:  X.0.0
# 或直接:  bash scripts/release.sh minor
set -euo pipefail

LEVEL="${1:-patch}"
case "$LEVEL" in
  patch | minor | major) ;;
  *) echo "用法: pnpm release [patch|minor|major]"; exit 1 ;;
esac

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "master" ] || {
  echo "请在 master 上发布(当前在 $BRANCH)。先把 dev 合并到 master 再发。"
  exit 1
}
[ -z "$(git status --porcelain)" ] || {
  echo "工作区不干净,先提交或清理改动再发布。"
  exit 1
}

echo "==> 同步远端"
git pull --ff-only

grep -q "^## \[未发布\]" CHANGELOG.md || {
  echo "CHANGELOG.md 缺少「## [未发布]」段,先补上本次要发布的内容。"
  exit 1
}

echo "==> 跑检查(tsc / lint / test / validate)"
pnpm install --frozen-lockfile >/dev/null
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm validate

echo "==> 升版本号(version 钩子会定版 CHANGELOG,并提交 + 打 tag)"
pnpm version "$LEVEL" --message "release: v%s"

echo "==> 推送 master 与 tag"
git push origin master --follow-tags

NEW="$(node -p "require('./package.json').version")"
echo "✔ 已发布 v${NEW} 并推送 tag。CI 正在出镜像 + 生成 GitHub Release。"
echo "  上线(手动): ssh 到服务器 → cd /srv/bixuetang && git pull && ./scripts/deploy.sh"
