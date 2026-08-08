#!/usr/bin/env bash
# 服务器一键更新（免本地构建）：可选配置向导 → 拉取 CI 已构建好的镜像 → 滚动重启。
#
#   ssh root@<host> '/srv/bixuetang/scripts/deploy.sh'            # 部署(必填缺失时才问)
#   ssh root@<host> '/srv/bixuetang/scripts/deploy.sh --config'   # 只跑配置向导,不部署
#   ssh root@<host> '/srv/bixuetang/scripts/deploy.sh --reconfigure'  # 部署前逐项过一遍配置
#
# 镜像由 GitHub Actions 在 master push 时构建并推到 GHCR
# (ghcr.io/zzxzzk115/bixuetang:latest，public 包，pull 无需登录)，服务器上不跑 build。
# 开机自启不靠这个脚本：compose 里 restart: unless-stopped，机器重启容器自会回来。
#
# 配置全部落在 APP_DIR/.env（compose 自动读取，已被 gitignore，不会进仓库）。
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/bixuetang}"
ENV_FILE="$APP_DIR/.env"

MODE=deploy            # deploy | config
FORCE_WIZARD=0         # --reconfigure 时逐项过一遍(含已填项)
for a in "$@"; do
  case "$a" in
    --config|--configure|-c) MODE=config ;;
    --reconfigure|-r)        FORCE_WIZARD=1 ;;
    --help|-h)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "未知参数: $a（--config / --reconfigure / --help）" >&2; exit 2 ;;
  esac
done

# docker compose / git 都要在 APP_DIR 里跑;配置向导写的是绝对路径 $ENV_FILE。
cd "$APP_DIR"

# ── .env 读写小工具 ───────────────────────────────────────────────
# 值可能含 +/=、密码特殊字符：一律经 ENVIRON 传给 awk，避免转义地狱。
get_env() { [ -f "$ENV_FILE" ] || return 0; sed -n "s/^$1=//p" "$ENV_FILE" | head -1; }

set_env() {
  local key="$1" val="$2" tmp
  touch "$ENV_FILE"
  tmp="$(mktemp)"
  VAL="$val" awk -v k="$key" '
    $0 ~ "^" k "=" { print k "=" ENVIRON["VAL"]; done=1; next }
    { print }
    END { if (!done) print k "=" ENVIRON["VAL"] }
  ' "$ENV_FILE" >"$tmp"
  mv "$tmp" "$ENV_FILE"
}

interactive() { [ -t 0 ] && [ -t 1 ]; }

confirm() { # confirm "问题" 默认Y  → 返回0=是
  local q="$1" def="${2:-Y}" ans
  local hint="[Y/n]"; [ "$def" = "N" ] && hint="[y/N]"
  printf '%s %s ' "$q" "$hint"
  read -r ans || true
  ans="${ans:-$def}"
  case "$ans" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

# prompt_env KEY "说明" "默认值" [secret]
# 有值:回车保留;无值:回车用默认(默认为空则跳过不写)。--reconfigure 也是同一逻辑。
prompt_env() {
  local key="$1" desc="$2" default="${3:-}" secret="${4:-}" cur input shown
  cur="$(get_env "$key")"
  echo
  echo "• $desc"
  if [ -n "$cur" ]; then
    shown="$cur"; [ -n "$secret" ] && shown="(已设置)"
    printf '  当前 = %s — 回车保留,或输入新值: ' "$shown"
  elif [ -n "$default" ]; then
    printf '  回车用默认 [%s],或输入新值: ' "$default"
  else
    printf '  回车跳过(留空),或输入值: '
  fi
  if [ -n "$secret" ]; then read -r -s input || true; echo; else read -r input || true; fi
  if [ -n "$input" ]; then
    set_env "$key" "$input"
  elif [ -z "$cur" ] && [ -n "$default" ]; then
    set_env "$key" "$default"
  fi
}

gen_vapid() {
  echo "  正在用镜像生成 VAPID 密钥对…"
  local out pub priv
  if out="$(docker compose run --rm -T bixuetang npx --yes web-push generate-vapid-keys --json 2>/dev/null)"; then
    pub="$(printf '%s' "$out" | sed -n 's/.*"publicKey":"\([^"]*\)".*/\1/p')"
    priv="$(printf '%s' "$out" | sed -n 's/.*"privateKey":"\([^"]*\)".*/\1/p')"
    if [ -n "$pub" ] && [ -n "$priv" ]; then
      set_env VAPID_PUBLIC_KEY "$pub"
      set_env VAPID_PRIVATE_KEY "$priv"
      echo "  ✓ 已写入 VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY"
      return 0
    fi
  fi
  echo "  ✗ 自动生成失败。可稍后手动:docker compose run --rm bixuetang npx web-push generate-vapid-keys"
  return 1
}

wizard() {
  echo "════════ 配置向导（写入 $ENV_FILE） ════════"

  echo; echo "── 必填 ──"
  prompt_env SITE_DOMAIN "生产域名（Caddy 据此签发 HTTPS，如 bixuetang.com）"
  prompt_env ADMIN_INITIAL_PASSWORD "管理端 admin 初始密码（留空=弱口令 admin，首次登录强制改）" "" secret

  echo; echo "── 学习提醒 · Web Push（可跳过，不配则设置页开关自动失效）──"
  if [ -n "$(get_env VAPID_PUBLIC_KEY)" ] && [ "$FORCE_WIZARD" = 0 ]; then
    echo "  已配置 VAPID，跳过。"
  elif confirm "  启用 Web Push 学习提醒?" N; then
    if confirm "  现在自动生成 VAPID 密钥对?" Y; then
      gen_vapid || { prompt_env VAPID_PUBLIC_KEY "VAPID_PUBLIC_KEY"; prompt_env VAPID_PRIVATE_KEY "VAPID_PRIVATE_KEY" "" secret; }
    else
      prompt_env VAPID_PUBLIC_KEY "VAPID_PUBLIC_KEY"
      prompt_env VAPID_PRIVATE_KEY "VAPID_PRIVATE_KEY" "" secret
    fi
    local dom; dom="$(get_env SITE_DOMAIN)"
    prompt_env VAPID_SUBJECT "VAPID_SUBJECT（联系人邮箱）" "mailto:admin@${dom:-bixuetang.com}"
    echo "  提示：到期召回还需挂 cron，见 README「学习提醒与邮件」。"
  fi

  echo; echo "── 密码重置邮件 · SMTP（可跳过，不配则重置链接只打进容器日志）──"
  if [ -n "$(get_env SMTP_HOST)" ] && [ "$FORCE_WIZARD" = 0 ]; then
    echo "  已配置 SMTP，跳过。"
  elif confirm "  配置发信 SMTP?" N; then
    prompt_env SMTP_HOST "SMTP_HOST"
    prompt_env SMTP_PORT "SMTP_PORT" "587"
    prompt_env SMTP_USER "SMTP_USER"
    prompt_env SMTP_PASS "SMTP_PASS" "" secret
    prompt_env SMTP_FROM "SMTP_FROM（发件人，留空则用 SMTP_USER）"
  fi

  echo; echo "════════ 配置完成 ════════"
}

require_env() { # 缺必填项就报错退出
  if [ -z "$(get_env SITE_DOMAIN)" ]; then
    echo "✗ 缺少 SITE_DOMAIN。跑 '$0 --config' 配置，或手动写进 $ENV_FILE。" >&2
    exit 1
  fi
}

# ── 主流程 ────────────────────────────────────────────────────────
if [ "$MODE" = config ]; then
  interactive || { echo "非交互环境无法跑向导。" >&2; exit 1; }
  wizard
  echo "现在可运行:$0   进行部署。"
  exit 0
fi

# deploy 模式：交互式且(缺必填 或 --reconfigure 或 用户想改)时才进向导，否则快速部署。
if interactive; then
  if [ -z "$(get_env SITE_DOMAIN)" ]; then
    echo "首次部署或缺少必填配置，进入配置向导："
    wizard
  elif [ "$FORCE_WIZARD" = 1 ]; then
    wizard
  elif confirm "检查/修改配置后再部署?" N; then
    wizard
  fi
fi

require_env

echo "==> 拉取仓库（更新 compose / 脚本 / 内容，不构建代码）"
git pull --ff-only

echo "==> 拉取最新镜像"
docker compose pull

echo "==> 滚动重启"
docker compose up -d

echo "==> 清理悬空旧镜像层"
docker image prune -f >/dev/null

echo "==> 当前状态"
docker compose ps
