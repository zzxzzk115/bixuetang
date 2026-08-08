# ---- 依赖层 ----
FROM node:22-alpine AS deps
WORKDIR /app
# better-sqlite3 没有 musl 预编译包，要在这里用 node-gyp 现编，
# 而 alpine 基础镜像不带编译链。这几个包只存在于本层，不进运行镜像。
RUN apk add --no-cache python3 make g++
# node-gyp 默认去 unofficial-builds.nodejs.org 下载头文件,那个源时不时
# 挂掉会把 CI 一起带走;官方镜像本身就带头文件,指过去让构建离线可复现
ENV npm_config_nodedir=/usr/local
# corepack 随 node 分发,按 package.json 的 packageManager 锁定 pnpm 版本。
# 非 TTY 构建里关掉下载确认提示,否则会卡住等输入。
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# --frozen-lockfile:严格按 lock 装,lock 与 package.json 不一致就报错
RUN pnpm install --frozen-lockfile

# ---- 构建层 ----
FROM node:22-alpine AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# ---- 运行层 ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/bixuetang.db
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup -S bixuetang && adduser -S bixuetang -G bixuetang \
  && mkdir -p /data && chown bixuetang:bixuetang /data

# standalone 只打包被 trace 到的依赖；content/ 与 drizzle/ 是运行期 fs 读取，需显式拷贝
COPY --from=build --chown=bixuetang:bixuetang /app/.next/standalone ./
COPY --from=build --chown=bixuetang:bixuetang /app/.next/static ./.next/static
COPY --from=build --chown=bixuetang:bixuetang /app/public ./public
COPY --from=build --chown=bixuetang:bixuetang /app/content ./content
COPY --from=build --chown=bixuetang:bixuetang /app/drizzle ./drizzle

USER bixuetang
EXPOSE 3000
VOLUME /data

# 迁移由 instrumentation.ts 在服务启动时自动执行
CMD ["node", "server.js"]
