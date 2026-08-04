# ---- 依赖层 ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci 在 Windows 生成的 lock 上可能缺可选依赖（npm/cli#4828），与 CI 保持一致用 install
RUN npm install --no-audit --no-fund

# ---- 构建层 ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

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
