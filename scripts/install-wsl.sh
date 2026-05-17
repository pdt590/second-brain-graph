#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:-}"
APP_DIR="${SECOND_BRAIN_APP_DIR:-$HOME/second-brain-graph-app}"
PORT="${SECOND_BRAIN_PORT:-3030}"
HOST="${SECOND_BRAIN_HOST:-0.0.0.0}"
LOG_DIR="$APP_DIR/logs"
PID_FILE="$APP_DIR/server.pid"
DEFAULT_ADMIN_USER="${SECOND_BRAIN_ADMIN_USER:-admin}"
DEFAULT_ADMIN_PASSWORD="${SECOND_BRAIN_ADMIN_PASSWORD:-123456}"

info() {
  printf '\033[1;34m[INFO]\033[0m %s\n' "$*"
}

ok() {
  printf '\033[1;32m[OK]\033[0m %s\n' "$*"
}

warn() {
  printf '\033[1;33m[WARN]\033[0m %s\n' "$*"
}

fail() {
  printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1
}

detect_node() {
  if need_command node && need_command npm; then
    return 0
  fi

  if [ -x "$HOME/.hermes/node/bin/node" ]; then
    export PATH="$HOME/.hermes/node/bin:$PATH"
  fi

  if need_command node && need_command npm; then
    return 0
  fi

  fail "Node.js and npm were not found in WSL. Install Node.js 18+ in WSL, or make sure Hermes bundled Node is at ~/.hermes/node/bin."
}

detect_wiki_dir() {
  if [ -n "${HERMES_WIKI_DIR:-}" ] && [ -d "$HERMES_WIKI_DIR" ]; then
    printf '%s\n' "$HERMES_WIKI_DIR"
    return
  fi

  local candidates=(
    "$HOME/.hermes/llm-wiki"
    "$HOME/wiki"
    "$HOME/llm-wiki"
    "$HOME/.wiki"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [ -d "$candidate" ]; then
      printf '%s\n' "$candidate"
      return
    fi
  done

  printf '%s\n' "$HOME/.hermes/llm-wiki"
}

detect_api_key() {
  local env_file="$HOME/.hermes/.env"
  if [ -f "$env_file" ]; then
    awk -F= '/^API_SERVER_KEY=/ {print $2; exit}' "$env_file" | sed "s/^['\"]//; s/['\"]$//"
  fi
}

detect_hermes_target() {
  local target
  if [ -n "${HERMES_API_TARGET:-}" ]; then
    printf '%s\n' "$HERMES_API_TARGET"
    return
  fi

  for target in "http://127.0.0.1:8643" "http://127.0.0.1:8642"; do
    if curl -fsS --max-time 1 "$target/health" >/dev/null 2>&1; then
      printf '%s\n' "$target"
      return
    fi
  done

  printf '%s\n' "http://127.0.0.1:8643"
}

stop_existing_server() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then
      info "Stopping existing Second Brain Graph server (pid $pid)..."
      kill "$pid" >/dev/null 2>&1 || true
      sleep 1
    fi
    rm -f "$PID_FILE"
  fi

  if need_command lsof; then
    local port_pid
    port_pid="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
    if [ -n "$port_pid" ]; then
      warn "Port $PORT is already in use by pid $port_pid. Stopping it."
      kill "$port_pid" >/dev/null 2>&1 || true
      sleep 1
    fi
  fi
}

write_helper_scripts() {
  cat > "$APP_DIR/start-second-brain.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"
if [ -f server.pid ] && kill -0 "$(cat server.pid)" >/dev/null 2>&1; then
  echo "Second Brain Graph is already running: http://localhost:${SECOND_BRAIN_PORT:-3030}"
  exit 0
fi
mkdir -p logs
export SECOND_BRAIN_HOST="${SECOND_BRAIN_HOST:-0.0.0.0}"
export SECOND_BRAIN_PORT="${SECOND_BRAIN_PORT:-3030}"
nohup npm run serve > logs/server.log 2>&1 &
echo $! > server.pid
echo "Second Brain Graph started: http://localhost:${SECOND_BRAIN_PORT}"
EOF

  cat > "$APP_DIR/stop-second-brain.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"
if [ -f server.pid ] && kill -0 "$(cat server.pid)" >/dev/null 2>&1; then
  kill "$(cat server.pid)"
  rm -f server.pid
  echo "Second Brain Graph stopped."
else
  echo "Second Brain Graph is not running."
fi
EOF

  cat > "$APP_DIR/status-second-brain.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"
PORT="${SECOND_BRAIN_PORT:-3030}"
if [ -f server.pid ] && kill -0 "$(cat server.pid)" >/dev/null 2>&1; then
  echo "Running: http://localhost:$PORT"
else
  echo "Not running."
fi
echo
echo "Recent logs:"
tail -n 40 logs/server.log 2>/dev/null || true
EOF

  cat > "$APP_DIR/reset-admin-password.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"
NEW_PASSWORD="${1:-123456}"
if [ -f .env ]; then
  if grep -q '^SECOND_BRAIN_ADMIN_PASSWORD=' .env; then
    sed -i "s/^SECOND_BRAIN_ADMIN_PASSWORD=.*/SECOND_BRAIN_ADMIN_PASSWORD=$NEW_PASSWORD/" .env
  else
    printf '\nSECOND_BRAIN_ADMIN_PASSWORD=%s\n' "$NEW_PASSWORD" >> .env
  fi
fi
bash "$APP_DIR/stop-second-brain.sh" >/dev/null 2>&1 || true
rm -f "$APP_DIR/data/auth.json"
bash "$APP_DIR/start-second-brain.sh"
echo
echo "Admin username: admin"
echo "Admin password: $NEW_PASSWORD"
EOF

  chmod +x "$APP_DIR/start-second-brain.sh" "$APP_DIR/stop-second-brain.sh" "$APP_DIR/status-second-brain.sh" "$APP_DIR/reset-admin-password.sh"
}

open_windows_browser() {
  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "Start-Process 'http://localhost:$PORT'" >/dev/null 2>&1 || true
  fi
}

if [ -z "$SOURCE_DIR" ] || [ ! -d "$SOURCE_DIR" ]; then
  fail "Installer source directory was not provided or does not exist."
fi

info "Installing from: $SOURCE_DIR"
info "Target app directory: $APP_DIR"

detect_node
info "Node: $(node --version)"
info "npm: $(npm --version)"

WIKI_DIR="$(detect_wiki_dir)"
API_KEY="$(detect_api_key)"
HERMES_TARGET="$(detect_hermes_target)"

if [ ! -d "$WIKI_DIR" ]; then
  warn "Wiki directory was not found yet: $WIKI_DIR"
  warn "The app will still install, but the graph will be empty until HERMES_WIKI_DIR points to the llm-wiki folder."
fi

if [ -z "$API_KEY" ]; then
  warn "API_SERVER_KEY was not found in ~/.hermes/.env. Chat can be configured later by editing $APP_DIR/.env."
fi

mkdir -p "$APP_DIR"

info "Copying app files into WSL..."
if need_command rsync; then
  rsync -a --delete \
    --exclude ".git" \
    --exclude "node_modules" \
    --exclude "dist" \
    --exclude "data" \
    --exclude "logs" \
    --exclude "projects" \
    "$SOURCE_DIR"/ "$APP_DIR"/
else
  warn "rsync not found; using tar copy fallback."
  tar -C "$SOURCE_DIR" \
    --exclude ".git" \
    --exclude "node_modules" \
    --exclude "dist" \
    --exclude "data" \
    --exclude "logs" \
    --exclude "projects" \
    -cf - . | tar -C "$APP_DIR" -xf -
fi

cd "$APP_DIR"
mkdir -p "$LOG_DIR" data

info "Writing runtime configuration..."
cat > "$APP_DIR/.env" <<EOF
HERMES_WIKI_DIR=$WIKI_DIR
HERMES_API_TARGET=$HERMES_TARGET
API_SERVER_KEY=$API_KEY
SECOND_BRAIN_HOST=$HOST
SECOND_BRAIN_PORT=$PORT
SECOND_BRAIN_ADMIN_USER=$DEFAULT_ADMIN_USER
SECOND_BRAIN_ADMIN_PASSWORD=$DEFAULT_ADMIN_PASSWORD
EOF

info "Installing dependencies. This can take a minute..."
npm install

info "Building frontend..."
npm run build

write_helper_scripts
stop_existing_server

if [ "$DEFAULT_ADMIN_PASSWORD" = "123456" ] && [ -f "$APP_DIR/data/auth.json" ]; then
  warn "Resetting existing admin password to the installer default."
  rm -f "$APP_DIR/data/auth.json"
fi

info "Starting Second Brain Graph..."
SECOND_BRAIN_HOST="$HOST" SECOND_BRAIN_PORT="$PORT" nohup npm run serve > "$LOG_DIR/server.log" 2>&1 &
echo $! > "$PID_FILE"
sleep 2

if kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
  ok "Server started."
else
  tail -n 80 "$LOG_DIR/server.log" >&2 || true
  fail "Server failed to start."
fi

if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
  ok "App is responding at http://localhost:$PORT"
else
  warn "The server process is running, but the HTTP check did not pass yet. Check logs with:"
  warn "  wsl bash $APP_DIR/status-second-brain.sh"
fi

WSL_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
open_windows_browser

cat <<EOF

============================================================
Second Brain Graph is installed.

Open in Windows browser:
  http://localhost:$PORT
  ${WSL_IP:+http://$WSL_IP:$PORT}

Login:
  username: $DEFAULT_ADMIN_USER
  password: $DEFAULT_ADMIN_PASSWORD

Installed in WSL:
  $APP_DIR

Helper commands inside WSL:
  bash $APP_DIR/start-second-brain.sh
  bash $APP_DIR/stop-second-brain.sh
  bash $APP_DIR/status-second-brain.sh
  bash $APP_DIR/reset-admin-password.sh 123456

Configuration:
  $APP_DIR/.env

Wiki directory:
  $WIKI_DIR

Hermes API target:
  $HERMES_TARGET
============================================================
EOF
