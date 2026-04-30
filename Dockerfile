# ---------- Stage 1: 构建前端 ----------
FROM node:20-alpine AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- Stage 2: 构建后端 ----------
FROM node:20-alpine AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --no-audit --no-fund
COPY server/ ./
RUN npm run build

# ---------- Stage 3: 运行时 ----------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/server

# 仅安装生产依赖，缩小镜像体积
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# 拷贝后端编译产物
COPY --from=server-builder /app/server/dist ./dist
# 拷贝前端构建产物到 server/public
COPY --from=web-builder /app/web/dist ./public
# 提供示例配置（实际配置通过 volume 挂载或 env 注入覆盖）
COPY env.config.json.example /app/env.config.json.example

# 默认配置文件路径：/app/server/env.config.json（位于 server 上一级）
# 推荐运行时挂载真实文件：-v /host/env.config.json:/app/env.config.json:ro
EXPOSE 3002

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/api/health || exit 1

CMD ["node", "dist/index.js"]
