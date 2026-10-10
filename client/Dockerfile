# ===== WordUp 前端镜像（Vue 静态文件 + nginx 反代） =====
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ===== 运行时：nginx 托管静态文件 + /api 反代 + HTTPS =====
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 容器内自续期：官方镜像自带 nginx-docker-entrypoint，
# 额外装 cron 用于证书 reload 通知（简单起见用宿主机 cron，此处留最小镜像）

EXPOSE 80 443
