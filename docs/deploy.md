# WordUp 生产部署（Docker Compose + 阿里云 ACR）

镜像仓库：`registry.cn-beijing.aliyuncs.com/yushk/`

| 镜像 | 内容 |
|---|---|
| `wordup-server` | Node 20 + tsx 运行后端，启动时自动 `prisma migrate deploy` |
| `wordup-client` | Vue build 产物 + nginx（静态托管 + `/api` 反代 server:3000） |

## 一、本地构建并推送镜像

```bash
cd server
docker build -t registry.cn-beijing.aliyuncs.com/yushk/wordup-server:latest .

cd ../client
docker build -t registry.cn-beijing.aliyuncs.com/yushk/wordup-client:latest .

docker login registry.cn-beijing.aliyuncs.com   # 阿里云 ACR 用户名/密码
docker push registry.cn-beijing.aliyuncs.com/yushk/wordup-server:latest
docker push registry.cn-beijing.aliyuncs.com/yushk/wordup-client:latest
```

## 二、服务器部署

服务器只需要 Docker，不需要 Node/git/源码。

```bash
# 1. 传两个文件到服务器（scp / git clone 均可）
#    docker-compose.prod.yml  .env.production.example
scp docker-compose.prod.yml .env.production.example user@server:/opt/wordup/

# 2. 服务器上准备 .env
cd /opt/wordup
cp .env.production.example .env
vim .env   # 填入强密码的 POSTGRES_PASSWORD 和随机 JWT_SECRET
# 生成建议：openssl rand -base64 24 / 48

# 3. 登录镜像仓库并拉起
docker login registry.cn-beijing.aliyuncs.com
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

访问 `http://服务器IP/` 即可。首个注册用户可用管理后台导入词书；或本地导出词书 SQL 后灌入。

## 三、更新版本

```bash
# 本地：改代码 → build → push（同上）
# 服务器：
cd /opt/wordup
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## 四、常用运维

```bash
docker logs -f wordup-server            # 看后端日志
docker compose -f docker-compose.prod.yml ps
docker exec -it wordup-postgres psql -U wordup -d wordup   # 进数据库
docker compose -f docker-compose.prod.yml down             # 停止（数据保留）
docker compose -f docker-compose.prod.yml down -v          # 停止并删数据（慎用）
```

## 架构说明

```
浏览器 → :80 nginx(wordup-client)
            ├─ 静态文件 /usr/share/nginx/html（Vue SPA）
            └─ /api/* → http://server:3000（wordup-server 容器）
                            └─ postgres:5432（wordup-postgres，仅容器网络内可达）
```

- PostgreSQL **不对外暴露端口**（需要临时连接时取消 compose 里 ports 注释，只绑 127.0.0.1）
- server 容器启动命令：`prisma migrate deploy && tsx src/index.ts`（迁移幂等，重启安全）
- HTTPS/域名：在 nginx 前面再加一层（云厂商 SLB / Caddy / 宿主机 nginx）或改 `client/nginx.conf` 挂载证书
