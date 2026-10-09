# ===== WordUp 后端镜像 =====
# 源码用 .ts 后缀 import，直接用 tsx 运行（免 tsc 编译产物后缀问题）
FROM node:20-alpine AS builder
WORKDIR /app

# 先拷贝依赖清单，利用层缓存
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ===== 运行时 =====
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# 非 root 运行
RUN addgroup -S wordup && adduser -S wordup -G wordup

COPY --from=builder /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src

USER wordup

EXPOSE 3000

# 启动前先执行迁移，再起服务（迁移幂等）
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]
