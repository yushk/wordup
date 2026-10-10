#!/usr/bin/env bash
# WordUp 一键构建推送镜像到阿里云 ACR
# 用法：
#   ./deploy.sh            # 构建 latest
#   ./deploy.sh v1.2.0     # 构建指定版本 tag
#   ./deploy.sh v1.2.0 --skip-build   # 只推送已存在的镜像
set -e
cd "$(dirname "$0")"   # 切到仓库根（脚本在根目录）

REG=registry.cn-beijing.aliyuncs.com/yushk
TAG=${1:-latest}
SKIP_BUILD=false
[[ "${2:-}" == "--skip-build" ]] && SKIP_BUILD=true

# TAG 合法性：字母数字 . _ - 开头（防误传 --help 之类）
if [[ "$TAG" == -* ]] || [[ ! "$TAG" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "错误：非法 tag '$TAG'（须以字母数字开头，只含字母数字 . _ -）" >&2
  exit 1
fi

echo "==> tag: $TAG"

if [ "$SKIP_BUILD" = false ]; then
  echo "==> 构建 server（build context = 仓库根）"
  docker build -f server/Dockerfile -t $REG/wordup-server:$TAG .
  echo "==> 构建 client"
  docker build -f client/Dockerfile -t $REG/wordup-client:$TAG client/
fi

echo "==> 推送"
docker push $REG/wordup-server:$TAG
docker push $REG/wordup-client:$TAG
# compose 引用 latest：同步更新（版本 tag 与 latest 同源，避免二者漂移）
if [ "$TAG" != "latest" ]; then
  docker tag $REG/wordup-server:$TAG $REG/wordup-server:latest
  docker tag $REG/wordup-client:$TAG $REG/wordup-client:latest
  docker push $REG/wordup-server:latest
  docker push $REG/wordup-client:latest
fi

echo ""
echo "✓ 完成。服务器上更新："
echo "  docker compose -f docker-compose.prod.yml pull"
echo "  docker compose -f docker-compose.prod.yml up -d"
