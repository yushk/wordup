# ===== WordUp 后端镜像 =====
# 注意：build context 是仓库根目录（不是 server/）：
#   docker build -f server/Dockerfile -t registry.cn-beijing.aliyuncs.com/yushk/wordup-server:latest .
# 源码用 .ts 后缀 import，直接用 tsx 运行（免 tsc 编译产物后缀问题）
FROM node:20-alpine AS builder
WORKDIR /app

# 先拷贝依赖清单，利用层缓存
COPY server/package.json server/package-lock.json ./
COPY server/prisma ./prisma
RUN npm ci

# ===== 运行时 =====
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# 非 root 运行
RUN addgroup -S wordup && adduser -S wordup -G wordup

COPY --from=builder /app/node_modules ./node_modules
COPY server/package.json server/tsconfig.json ./
COPY server/prisma ./prisma
COPY server/scripts ./scripts
COPY server/src ./src
# 内置开源词书（seed 启动时幂等导入；约 6MB）
COPY data ./data

USER wordup

EXPOSE 3000

# 启动：迁移 → 种子（幂等：ADMIN 已存在跳过、词书按 headword 去重、文章按标题去重）→ 起服务
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && npx tsx src/index.ts"]
