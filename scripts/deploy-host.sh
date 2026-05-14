#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${SECOND_BRAIN_APP_DIR:-$HOME/second-brain-graph-app}"
STATIC_DIR="${SECOND_BRAIN_STATIC_DIR:-/var/www/second-brain/dist}"
WIKI_DIR="${HERMES_WIKI_DIR:-$HOME/wiki}"
HOST="${SECOND_BRAIN_HOST:-127.0.0.1}"
PORT="${SECOND_BRAIN_PORT:-3030}"
NODE_BIN="${SECOND_BRAIN_NODE_BIN:-$(command -v node)}"
NGINX_SITE="${SECOND_BRAIN_NGINX_SITE:-/etc/nginx/sites-available/second-brain}"
NGINX_ENABLED="${SECOND_BRAIN_NGINX_ENABLED:-/etc/nginx/sites-enabled/second-brain}"
SERVER_NAME="${SECOND_BRAIN_SERVER_NAME:-_}"
PROJECT_DIR="$(pwd -P)"

if [[ ! -x "$NODE_BIN" ]]; then
  echo "Node binary not found. Set SECOND_BRAIN_NODE_BIN." >&2
  exit 1
fi

mkdir -p "$APP_DIR/data" "$APP_DIR/logs"
APP_DIR="$(cd "$APP_DIR" && pwd -P)"

if [[ ! -d dist || ! -d server ]]; then
  echo "Run this script from the project root after npm run build." >&2
  exit 1
fi

if [[ "$PROJECT_DIR" != "$APP_DIR" ]]; then
  rsync -a --delete dist/ "$APP_DIR/dist/"
  rsync -a --delete server/ "$APP_DIR/server/"
  cp package.json package-lock.json "$APP_DIR/"
fi

cat > "$APP_DIR/start.sh" <<EOS
#!/usr/bin/env bash
set -euo pipefail
export HERMES_WIKI_DIR="\${HERMES_WIKI_DIR:-$WIKI_DIR}"
export SECOND_BRAIN_AUTH_FILE="\${SECOND_BRAIN_AUTH_FILE:-$APP_DIR/data/auth.json}"
export SECOND_BRAIN_HOST="\${SECOND_BRAIN_HOST:-$HOST}"
export SECOND_BRAIN_PORT="\${SECOND_BRAIN_PORT:-$PORT}"
cd "$APP_DIR"
exec "$NODE_BIN" server/second-brain-server.mjs
EOS
chmod +x "$APP_DIR/start.sh"

sudo mkdir -p "$STATIC_DIR"
APP_DIST_DIR="$(cd "$APP_DIR/dist" && pwd -P)"
STATIC_DIR_REAL="$(cd "$STATIC_DIR" && pwd -P)"
if [[ "$APP_DIST_DIR" != "$STATIC_DIR_REAL" ]]; then
  sudo rsync -a --delete "$APP_DIR/dist/" "$STATIC_DIR/"
fi

sudo tee "$NGINX_SITE" >/dev/null <<NGINX
server {
  listen 80;
  server_name $SERVER_NAME;

  root $STATIC_DIR;
  index index.html;

  location /api/ {
    proxy_pass http://$HOST:$PORT/api/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
  }

  location / {
    try_files \$uri \$uri/ /index.html;
  }
}
NGINX

sudo ln -sf "$NGINX_SITE" "$NGINX_ENABLED"
sudo nginx -t
sudo systemctl reload nginx

if pgrep -f "$APP_DIR/server/second-brain-server.mjs" >/dev/null 2>&1; then
  pkill -f "$APP_DIR/server/second-brain-server.mjs"
  sleep 1
fi

nohup "$APP_DIR/start.sh" > "$APP_DIR/logs/server.log" 2>&1 &
sleep 2

echo "Second Brain Graph deployed"
echo "app:    $APP_DIR"
echo "static: $STATIC_DIR"
echo "wiki:   $WIKI_DIR"
echo "api:    http://$HOST:$PORT"
tail -n 20 "$APP_DIR/logs/server.log"
