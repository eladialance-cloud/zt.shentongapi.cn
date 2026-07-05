# =============================================================================
# 深瞳AI 后端 Dockerfile - 多阶段构建
# Stage 1: base   - 安装全部依赖 + 编译 TypeScript
# Stage 2: prod   - 仅生产依赖 + dist 产物
# =============================================================================

# ---------- Stage 1: base ----------
FROM node:20-alpine AS base

# 安装构建工具(bcrypt 等原生模块需要)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 先复制依赖清单(利用 Docker 层缓存)
COPY package.json package-lock.json ./

# 安装全部依赖(含 devDependencies)
RUN npm ci --no-audit --no-fund

# 复制源码与构建配置
COPY tsconfig.json nest-cli.json ./
COPY src ./src

# 编译 TypeScript
RUN npm run build

# ---------- Stage 2: prod ----------
FROM node:20-alpine AS prod

# 安装生产环境原生模块依赖
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 复制依赖清单
COPY package.json package-lock.json ./

# 仅安装生产依赖
RUN npm ci --production --no-audit --no-fund && \
    npm cache clean --force

# 从 Stage 1 复制编译产物
COPY --from=base /app/dist ./dist

# 暴露端口(NestJS 默认 3001)
EXPOSE 3001

# 健康检查(可选,容器层已有 mysql/redis 健康检查)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

# 启动命令
CMD ["node", "dist/main.js"]
