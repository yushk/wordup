# WordUp 生产部署（Docker Compose + 阿里云 ACR）

镜像仓库：`registry.cn-beijing.aliyuncs.com/yushk/`

| 镜像 | 内容 |
|---|---|
| `wordup-server` | Node 20 + tsx 运行后端；内置 8 本词书，启动时自动 `migrate deploy` + seed（幂等导入词书/创建管理员） |
| `wordup-client` | Vue build 产物 + nginx（静态托管 + `/api` 反代 server:3000） |

## 一、本地构建并推送镜像

在**仓库根目录**执行（server 的 build context 是仓库根——要打包 `data/wordbooks/`，注意 `-f server/Dockerfile` 和结尾的 `.`）：

```bash
cd <仓库根目录>

# 1. 登录阿里云 ACR（只需一次，凭证存在本地）
docker login registry.cn-beijing.aliyuncs.com

# 2. 构建后端镜像（context 是仓库根，不是 server/！）
docker build -f server/Dockerfile \
  -t registry.cn-beijing.aliyuncs.com/yushk/wordup-server:latest \
  .

# 3. 构建前端镜像（context 是 client/）
docker build -f client/Dockerfile \
  -t registry.cn-beijing.aliyuncs.com/yushk/wordup-client:latest \
  client/

# 4. 推送
docker push registry.cn-beijing.aliyuncs.com/yushk/wordup-server:latest
docker push registry.cn-beijing.aliyuncs.com/yushk/wordup-client:latest
```

### 版本 tag（可选，建议发布时用）

`latest` 之外同时打版本号，方便回滚：

```bash
VERSION=v1.1.0
docker build -f server/Dockerfile -t registry.cn-beijing.aliyuncs.com/yushk/wordup-server:$VERSION .
docker build -f client/Dockerfile -t registry.cn-beijing.aliyuncs.com/yushk/wordup-client:$VERSION client/
docker push registry.cn-beijing.aliyuncs.com/yushk/wordup-server:$VERSION
docker push registry.cn-beijing.aliyuncs.com/yushk/wordup-client:$VERSION
```

回滚时改 `docker-compose.prod.yml` 里的镜像 tag（或 `docker tag` 后 `up -d`）。

### 一键脚本

仓库根目录已带 `deploy.sh`（Git Bash / Linux / macOS 可直接跑）：

```bash
./deploy.sh              # 构建 latest 并推送
./deploy.sh v1.2.0       # 构建版本 tag 并推送
./deploy.sh v1.2.0 --skip-build   # 跳过构建只推送本地已有镜像
```

脚本内容（等价的手动命令就是上面两节）：

```bash
#!/usr/bin/env bash
set -e
REG=registry.cn-beijing.aliyuncs.com/yushk
TAG=${1:-latest}
echo "==> 构建 server:$TAG"
docker build -f server/Dockerfile -t $REG/wordup-server:$TAG .
echo "==> 构建 client:$TAG"
docker build -f client/Dockerfile -t $REG/wordup-client:$TAG client/
echo "==> 推送"
docker push $REG/wordup-server:$TAG
docker push $REG/wordup-client:$TAG
echo "==> 完成。服务器上执行：docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d"
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
vim .env   # 填 POSTGRES_PASSWORD / JWT_SECRET / ADMIN_PASSWORD（生成建议：openssl rand -base64 24 / 48）

# 3. 登录镜像仓库并拉起
docker login registry.cn-beijing.aliyuncs.com
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 4. 首次启动会自动完成（幂等，重启安全）：
#    建表迁移 → 创建管理员（ADMIN_EMAIL/ADMIN_PASSWORD）→ 导入 8 本内置词书（20589 词）+ 3 篇示例文章
docker logs -f wordup-server   # 观察种子进度，看到 "API listening" 即就绪
```

访问 `http://服务器IP/`，用 `ADMIN_EMAIL / ADMIN_PASSWORD` 登录即为管理员（可进 `/admin` 管理后台）。

## 二·五、HTTPS（Let's Encrypt 免费证书，自动续期）

新版 nginx 镜像已内置 443 + HTTP→HTTPS 301 跳转。部署完上面步骤后，在服务器上：

```bash
cd /opt/wordup

# 1. 先把 scripts/init-https.sh 传上来（或 git pull）
scp scripts/init-https.sh user@server:/opt/wordup/
chmod +x init-https.sh

# 2. 一键签发（要求域名已解析到本机、80/443 已放行）
./init-https.sh wordup.xin you@example.com
```

脚本会自动：
1. 生成临时自签证书让 nginx 起得来（解决鸡生蛋问题）
2. certbot webroot 验证签发真证书（90 天）
3. 拷贝到 `certs/` 并重启 nginx 加载
4. 安装 crontab 每天 3:17 自动续期（到期前 30 天才真正续），日志在 `certbot/renew.log`

验证：浏览器开 `https://wordup.xin`，地址栏出现锁；`curl -I http://wordup.xin` 应返回 301。

**注意**：compose 里 nginx 挂载了 `./certs` 和 `./certbot/` 目录，脚本会自动创建。

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
