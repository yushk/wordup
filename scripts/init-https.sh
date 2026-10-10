#!/usr/bin/env bash
# WordUp HTTPS 一键配置（Let's Encrypt / Certbot webroot 模式）
#
# 用法（服务器上，/opt/wordup 目录内）：
#   ./init-https.sh wordup.xin you@example.com      # 首次签发
#   ./init-https.sh renew                            # 手动续期（cron 会自动调）
#
# 前置条件：
#   1. 域名 A 记录已指向本服务器公网 IP
#   2. 安全组/防火墙已放行 80 和 443
#   3. docker compose 栈已在跑（nginx 容器 wordup-nginx 存在）
set -e
cd "$(dirname "$0")"

DOMAIN="$1"
EMAIL="$2"

mkdir -p certs certbot/www certbot/etc

# ── 续期分支 ─────────────────────────────────────────
if [ "$DOMAIN" = "renew" ]; then
  echo "==> 续期证书"
  docker run --rm \
    -v "$(pwd)/certbot/www:/var/www/certbot" \
    -v "$(pwd)/certbot/etc:/etc/letsencrypt" \
    certbot/certbot renew --webroot -w /var/www/certbot
  # renew 只在到期前 30 天才真正续期；把 live 下的证书同步到挂载目录
  for d in certbot/etc/live/*/; do
    name="$(basename "$d")"
    [ -f "$d/fullchain.pem" ] && cp "$d/fullchain.pem" "certs/${name}-fullchain.pem" && cp "$d/privkey.pem" "certs/${name}-privkey.pem"
  done
  # 主域名证书保持固定文件名（nginx.conf 引用）
  main="$(ls certbot/etc/live | grep -v '^-' | head -1)"
  if [ -n "$main" ]; then
    cp "certbot/etc/live/$main/fullchain.pem" certs/fullchain.pem
    cp "certbot/etc/live/$main/privkey.pem" certs/privkey.pem
  fi
  chmod 644 certs/*.pem 2>/dev/null || true
  docker exec wordup-nginx nginx -s reload 2>/dev/null || docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
  echo "✓ 续期检查完成"
  exit 0
fi

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "用法: $0 <域名> <邮箱>    或    $0 renew" >&2
  exit 1
fi

# ── 首次签发 ─────────────────────────────────────────
# nginx.conf 引用了证书文件，没有证书容器起不来（ACME webroot 又需要它在跑）。
# 先放自签占位证书让 nginx 起得来，签发后立即替换。
if [ ! -f certs/fullchain.pem ]; then
  echo "==> 生成临时自签占位证书（仅用于启动 nginx）"
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout certs/privkey.pem -out certs/fullchain.pem \
    -subj "/CN=$DOMAIN" 2>/dev/null
  docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
  sleep 2
fi

echo "==> 签发 $DOMAIN（webroot 验证，要求 80 端口的 ACME 路径可访问）"
docker run --rm \
  -v "$(pwd)/certbot/www:/var/www/certbot" \
  -v "$(pwd)/certbot/etc:/etc/letsencrypt" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email

echo "==> 拷贝证书到 certs/（nginx 容器挂载目录）"
cp "certbot/etc/live/$DOMAIN/fullchain.pem" certs/fullchain.pem
cp "certbot/etc/live/$DOMAIN/privkey.pem" certs/privkey.pem
chmod 644 certs/*.pem

echo "==> 重启 nginx 加载真证书"
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx

# 安装自动续期（每天 3:17 检查，证书到 30 天内才真正续）
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
CRON_LINE="17 3 * * * $SCRIPT_PATH renew >> $(pwd)/certbot/renew.log 2>&1"
if ! crontab -l 2>/dev/null | grep -qF "$SCRIPT_PATH"; then
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "✓ 已安装每日自动续期 crontab"
fi

echo ""
echo "✓ HTTPS 配置完成：https://$DOMAIN"
echo "  证书位置: $(pwd)/certs/"
echo "  续期日志: $(pwd)/certbot/renew.log"
